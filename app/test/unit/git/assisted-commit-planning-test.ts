import assert from 'node:assert'
import { describe, it } from 'node:test'
import { mkdir, readFile, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import {
  AssistedCommitPlanner,
  planAssistedCommits,
} from '../../../src/lib/assisted-commit-planning'
import { parseCopilotAssistedCommitResponse } from '../../../src/lib/copilot-assisted-commit'
import {
  AssistedCommitError,
  createSingleAssistedCommitPlan,
  executeAssistedCommitPlan,
  finalizeAssistedCommitTransaction,
  validateAssistedCommitPlan,
  withAssistedCommitSnapshot,
} from '../../../src/lib/git/assisted-commit'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import {
  count,
  indexPath,
  request,
  seed,
  tip,
  commitBytes,
} from '../../helpers/assisted-commit'
import {
  assertPlanningError,
  createMockPlanner,
  deferred,
  makeCopilotAccount,
  splitResponse,
  syntheticBYOKRequest,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { CopilotError } from '../../../src/lib/copilot-error'

describe('snapshot-only assisted commit planning', () => {
  it('passes selected-only partial hunks and mixed atomic units, preserving all real state until later execution', async t => {
    const base = Array.from({ length: 40 }, (_, i) => `line ${i + 1}\n`)
    const repository = await seed(t, {
      file: base.join(''),
      binary: Buffer.from([0, 1, 2]),
      other: 'old unselected file\n',
    })
    const changed = [...base]
    changed[1] = 'selected first hunk\n'
    changed[30] = 'UNSELECTED SECRET LINE\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    await writeFile(join(repository.path, 'binary'), Buffer.from([0, 1, 3]))
    await writeFile(join(repository.path, 'other'), 'UNSELECTED SECRET FILE\n')
    const input = await request(repository, ['file', 'binary'])
    const file = input.files.find(change => change.path === 'file')
    assert.ok(file)
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.strictEqual(diff.kind, DiffType.Text)
    if (diff.kind !== DiffType.Text) {
      throw new Error('Expected text diff')
    }
    const selection = DiffSelection.fromInitialSelection(
      DiffSelectionType.None
    ).withRangeSelection(
      diff.hunks[0].unifiedDiffStart,
      diff.hunks[0].lines.length,
      true
    )
    const selected = {
      ...input,
      files: input.files.map(change =>
        change.path === 'file' ? change.withSelection(selection) : change
      ),
    }
    const originalTip = await tip(repository)
    const index = await indexPath(repository)
    const originalIndex = await readFile(index)
    const worktree = await readFile(join(repository.path, 'file'))
    const binary = await readFile(join(repository.path, 'binary'))
    const progress: string[] = []
    const result = await withAssistedCommitSnapshot(
      repository,
      selected,
      async snapshot => {
        const propose = t.mock.fn<AssistedCommitPlanner>(async analysis => {
          assert.strictEqual(analysis, snapshot.analysis)
          assert.strictEqual(analysis.changes.length, 2)
          assert.ok(analysis.changes.some(change => change.kind === 'atomic'))
          assert.ok(
            analysis.changes.some(change => change.kind === 'text-hunk')
          )
          assert.ok(
            analysis.changes.every(
              change =>
                !change.diff.includes('UNSELECTED SECRET') &&
                change.path !== 'other'
            )
          )
          return splitResponse(analysis)
        })
        const checked = await planAssistedCommits(snapshot, propose, {
          onPlanningProgress: async event => {
            progress.push(event.kind)
          },
          onProgress: async event => {
            progress.push(event.kind)
          },
        })
        assert.strictEqual(propose.mock.callCount(), 1)
        assert.strictEqual(await tip(repository), originalTip)
        assert.deepStrictEqual(await readFile(index), originalIndex)
        assert.deepStrictEqual(
          await readFile(join(repository.path, 'file')),
          worktree
        )
        assert.deepStrictEqual(
          await readFile(join(repository.path, 'binary')),
          binary
        )
        assert.strictEqual(checked.plan.commits.length, 2)
        assert.strictEqual(checked.trees[1], snapshot.selectedTree)
        return executeAssistedCommitPlan(snapshot, checked)
      }
    )
    finalizeAssistedCommitTransaction(result)
    assert.deepStrictEqual(progress, ['planning', 'validating'])
    assert.strictEqual(await count(repository), 3)
    const expected = [...base]
    expected[1] = changed[1]
    const sha = result.head.sha
    assert.ok(sha)
    assert.deepStrictEqual(
      await commitBytes(repository, sha, 'file'),
      Buffer.from(expected.join(''))
    )
    assert.deepStrictEqual(
      await commitBytes(repository, sha, 'other'),
      Buffer.from('old unselected file\n')
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'file')),
      worktree
    )
    assert.deepStrictEqual(
      await readFile(join(repository.path, 'binary')),
      binary
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'other'), 'utf8'),
      'UNSELECTED SECRET FILE\n'
    )
  })

  it('accepts explicit uncertainty as one accurate whole-selection plan and explicit unsafe as an error', async t => {
    const repository = await seed(t, {
      first: 'old first\n',
      second: 'old second\n',
    })
    await writeFile(join(repository.path, 'first'), 'new first\n')
    await writeFile(join(repository.path, 'second'), 'new second\n')
    const input = await request(repository)
    const originalTip = await tip(repository)
    const index = await indexPath(repository)
    const originalIndex = await readFile(index)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const uncertainty = t.mock.fn<AssistedCommitPlanner>(async analysis => ({
        kind: 'uncertain-boundaries',
        snapshotId: analysis.snapshotId,
        title: 'Update both first and second together',
        description: 'Messages cover the entire selected changeset.',
      }))
      const checked = await planAssistedCommits(snapshot, uncertainty)
      assert.strictEqual(checked.plan.commits.length, 1)
      assert.strictEqual(
        checked.plan.commits[0].title,
        'Update both first and second together'
      )
      assert.deepStrictEqual(
        checked.plan.commits[0].changeIds,
        snapshot.analysis.changes.map(change => change.id)
      )
      const unsafe = t.mock.fn<AssistedCommitPlanner>(async analysis => ({
        kind: 'unsafe',
        snapshotId: analysis.snapshotId,
        reason: 'Cannot describe this selection safely',
      }))
      await assert.rejects(
        planAssistedCommits(snapshot, unsafe),
        assertPlanningError('unsafe')
      )
      assert.strictEqual(unsafe.mock.callCount(), 1)
      assert.strictEqual(uncertainty.mock.callCount(), 1)
      assert.strictEqual(await tip(repository), originalTip)
      assert.deepStrictEqual(await readFile(index), originalIndex)
    })
  })

  it('requests a NEW complete-selection message only after canonical unsafe split validation', async t => {
    const repository = await seed(t, { replaced: 'old file\n' })
    await unlink(join(repository.path, 'replaced'))
    await mkdir(join(repository.path, 'replaced'))
    await writeFile(join(repository.path, 'replaced', 'child'), 'new child\n')
    const input = await request(repository)
    const originalTip = await tip(repository)
    const index = await indexPath(repository)
    const originalIndex = await readFile(index)
    const phases: string[] = []
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const addition = snapshot.analysis.changes.find(
        change => change.path === 'replaced/child'
      )
      const deletion = snapshot.analysis.changes.find(
        change => change.path === 'replaced'
      )
      assert.ok(addition && deletion)
      const propose = t.mock.fn<AssistedCommitPlanner>(
        async (analysis, mode) => {
          assert.strictEqual(analysis, snapshot.analysis)
          if (mode === 'single-commit') {
            assert.deepStrictEqual(await readFile(index), originalIndex)
            assert.strictEqual(await tip(repository), originalTip)
            return wholeSelectionResponse(
              analysis,
              'Replace the old file with a directory containing the new child'
            )
          }
          return {
            kind: 'plan',
            snapshotId: analysis.snapshotId,
            commits: [
              { title: 'Add a child only', changeIds: [addition.id] },
              { title: 'Remove old file only', changeIds: [deletion.id] },
            ],
          }
        }
      )
      const checked = await planAssistedCommits(snapshot, propose, {
        onPlanningProgress: event => {
          phases.push(event.kind)
        },
        onProgress: event => {
          phases.push(event.kind)
        },
      })
      assert.deepStrictEqual(
        propose.mock.calls.map(call => call.arguments[1]),
        ['plan', 'single-commit']
      )
      assert.strictEqual(checked.plan.commits.length, 1)
      assert.strictEqual(
        checked.plan.commits[0].title,
        'Replace the old file with a directory containing the new child'
      )
      assert.notStrictEqual(checked.plan.commits[0].title, 'Add a child only')
      assert.strictEqual(checked.trees[0], snapshot.selectedTree)
      assert.deepStrictEqual(phases, [
        'planning',
        'validating',
        'summarizing-selection',
        'validating',
      ])
      assert.strictEqual(await tip(repository), originalTip)
      assert.deepStrictEqual(await readFile(index), originalIndex)
      assert.strictEqual(
        await readFile(join(repository.path, 'replaced', 'child'), 'utf8'),
        'new child\n'
      )
    })
  })

  it('never retries invalid data, auth, quota, timeout, stale selection or observer errors', async t => {
    const repository = await seed(t, { first: 'old\n', second: 'old\n' })
    await writeFile(join(repository.path, 'first'), 'new\n')
    await writeFile(join(repository.path, 'second'), 'new\n')
    const input = await request(repository)
    const originalTip = await tip(repository)
    const index = await indexPath(repository)
    const originalIndex = await readFile(index)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      for (const failure of [
        new AssistedCommitError('invalid-plan', 'invalid ownership'),
        new CopilotError('Authentication required', 401),
        new CopilotError('Quota exhausted', 402, {
          paymentRequiredErrorCode: 'quota_exceeded',
        }),
        new Error('SDK timed out'),
        new AssistedCommitError('selection-changed', 'stale'),
        new AssistedCommitError('index-changed', 'external index'),
        new AssistedCommitError('disposed', 'disposed'),
      ]) {
        const propose = t.mock.fn<AssistedCommitPlanner>(async () => {
          throw failure
        })
        await assert.rejects(
          planAssistedCommits(snapshot, propose),
          error => error === failure
        )
        assert.strictEqual(propose.mock.callCount(), 1)
      }
      for (const malformed of [
        '{}',
        'null',
        '{',
        JSON.stringify({ kind: 'plan', snapshotId: snapshot.id, commits: [] }),
        JSON.stringify({
          ...wholeSelectionResponse(snapshot.analysis),
          path: 'unselected',
        }),
      ]) {
        const propose = t.mock.fn<AssistedCommitPlanner>(async analysis =>
          parseCopilotAssistedCommitResponse(analysis, malformed)
        )
        await assert.rejects(
          planAssistedCommits(snapshot, propose),
          assertPlanningError('invalid-response')
        )
        assert.strictEqual(propose.mock.callCount(), 1)
      }
      const observerError = new AssistedCommitError(
        'unsafe-plan',
        'Observer error is not a Git boundary failure'
      )
      const propose = t.mock.fn<AssistedCommitPlanner>(async analysis =>
        splitResponse(analysis)
      )
      await assert.rejects(
        planAssistedCommits(snapshot, propose, {
          onProgress: () => {
            throw observerError
          },
        }),
        error => error === observerError
      )
      assert.strictEqual(propose.mock.callCount(), 1)
      assert.strictEqual(await tip(repository), originalTip)
      assert.deepStrictEqual(await readFile(index), originalIndex)
      assert.strictEqual(
        await readFile(join(repository.path, 'first'), 'utf8'),
        'new\n'
      )
      assert.strictEqual(
        await readFile(join(repository.path, 'second'), 'utf8'),
        'new\n'
      )
    })
  })

  it('rejects selected-file changes through the engine, without rereading live content in the planner or retrying', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    const originalTip = await tip(repository)
    const index = await indexPath(repository)
    const originalIndex = await readFile(index)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const propose = t.mock.fn<AssistedCommitPlanner>(async analysis => {
        // Simulate an independent editor, not a model tool.
        await writeFile(
          join(repository.path, 'file'),
          'external modification\n'
        )
        return wholeSelectionResponse(analysis)
      })
      await assert.rejects(
        planAssistedCommits(snapshot, propose),
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'selection-changed'
      )
      assert.strictEqual(propose.mock.callCount(), 1)
      assert.strictEqual(await tip(repository), originalTip)
      assert.deepStrictEqual(await readFile(index), originalIndex)
      assert.strictEqual(
        await readFile(join(repository.path, 'file'), 'utf8'),
        'external modification\n'
      )
    })
  })

  it('does not loop if a whole-selection fallback fails validation', async t => {
    const repository = await seed(t, { replaced: 'old\n' })
    await unlink(join(repository.path, 'replaced'))
    await mkdir(join(repository.path, 'replaced'))
    await writeFile(join(repository.path, 'replaced', 'child'), 'new\n')
    const input = await request(repository)
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const addition = snapshot.analysis.changes.find(
        change => change.path === 'replaced/child'
      )
      const deletion = snapshot.analysis.changes.find(
        change => change.path === 'replaced'
      )
      assert.ok(addition && deletion)
      const propose = t.mock.fn<AssistedCommitPlanner>(async (analysis, mode) =>
        mode === 'single-commit'
          ? wholeSelectionResponse(analysis, 'Replace file with directory')
          : {
              kind: 'plan',
              snapshotId: analysis.snapshotId,
              commits: [
                { title: 'Add child', changeIds: [addition.id] },
                { title: 'Delete file', changeIds: [deletion.id] },
              ],
            }
      )
      let validations = 0
      const failure = new AssistedCommitError(
        'unsafe-plan',
        'Second validation failed'
      )
      await assert.rejects(
        planAssistedCommits(snapshot, propose, {
          onProgress: () => {
            validations++
            if (validations === 2) {
              throw failure
            }
          },
        }),
        error => error === failure
      )
      assert.strictEqual(propose.mock.callCount(), 2)
      assert.strictEqual(await count(repository), 1)
    })
  })

  it('cancellation scopes both the snapshot and a pending SDK request without any real commit', async t => {
    const repository = await seed(t, { file: 'old\n' })
    await writeFile(join(repository.path, 'file'), 'selected\n')
    const input = await request(repository)
    const originalTip = await tip(repository)
    const index = await indexPath(repository)
    const originalIndex = await readFile(index)
    const mock = createMockPlanner(t)
    const started = deferred<void>()
    mock.send.mock.mockImplementation(() => {
      started.resolve()
      return new Promise<never>(() => {})
    })
    const controller = new AbortController()
    const operation = withAssistedCommitSnapshot(
      repository,
      input,
      snapshot =>
        planAssistedCommits(
          snapshot,
          (analysis, mode, signal) =>
            mock.store.proposeAssistedCommitPlan(
              makeCopilotAccount(),
              analysis,
              repository.path,
              {
                request: syntheticBYOKRequest(),
                mode,
                signal,
              }
            ),
          { signal: controller.signal }
        ),
      { signal: controller.signal }
    )
    await started.promise
    controller.abort()
    await assert.rejects(operation, assertPlanningError('cancelled'))
    assert.strictEqual(mock.forceStop.mock.callCount(), 1)
    assert.strictEqual(mock.listenerCount(), 0)
    assert.strictEqual(await tip(repository), originalTip)
    assert.deepStrictEqual(await readFile(index), originalIndex)
    assert.strictEqual(
      await readFile(join(repository.path, 'file'), 'utf8'),
      'selected\n'
    )
  })

  it('leaves snapshot disposal to its caller and makes allow-empty bypass explicit without a model', async t => {
    const repository = await seed(t, { file: 'old\n' })
    const input = await request(repository, [], { allowEmptyCommit: true })
    await withAssistedCommitSnapshot(repository, input, async snapshot => {
      const propose = t.mock.fn<AssistedCommitPlanner>(async analysis =>
        wholeSelectionResponse(analysis)
      )
      await assert.rejects(
        planAssistedCommits(snapshot, propose),
        assertPlanningError('empty-selection')
      )
      assert.strictEqual(propose.mock.callCount(), 0)
      const empty = createSingleAssistedCommitPlan(snapshot, {
        reason: 'empty-selection',
        title: 'Caller-titled empty commit',
      })
      const checked = await validateAssistedCommitPlan(snapshot, empty)
      assert.strictEqual(
        checked.plan.commits[0].title,
        'Caller-titled empty commit'
      )
      assert.deepStrictEqual(checked.plan.commits[0].changeIds, [])
      assert.strictEqual(await count(repository), 1)
    })
  })
})
