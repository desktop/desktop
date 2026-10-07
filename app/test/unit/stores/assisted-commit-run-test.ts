import assert from 'node:assert'
import { describe, it } from 'node:test'
import {
  mkdir,
  readFile,
  realpath,
  rename,
  unlink,
  writeFile,
} from 'fs/promises'
import { join } from 'path'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  commitBytes,
  count,
  indexPath,
  optionalBytes,
  rawGit,
  seed,
  tip,
} from '../../helpers/assisted-commit'
import {
  assistantMessage,
  deferred,
  makeCopilotAccount,
  splitResponse,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { DefaultCommitMessage } from '../../../src/models/commit-message'
import { PopupType } from '../../../src/models/popup'
import {
  AssistedCommitError,
  rollbackAssistedCommitTransaction,
} from '../../../src/lib/git/assisted-commit'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import { git } from '../../../src/lib/git/core'
import {
  DiffLineType,
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import { CopilotAssistedCommitError } from '../../../src/lib/copilot-assisted-commit'
import { CopilotError } from '../../../src/lib/copilot-error'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { Account } from '../../../src/models/account'
import { Repository } from '../../../src/models/repository'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'
import {
  isRepositoryGitPaused,
  withRepositoryGitOperation,
} from '../../../src/lib/git/repository-operation'

describe('AppStore assisted commit runs', () => {
  function awaitPopup(
    h: Awaited<ReturnType<typeof createAssistedCommitRunHarness>>,
    type: PopupType
  ) {
    const ready = deferred<void>()
    const subscription = h.appStore.onDidUpdate(() => {
      if (h.appStore['popupManager'].areTherePopupsOfType(type)) {
        ready.resolve()
      }
    })
    return { promise: ready.promise, subscription }
  }

  it('awaits one real selected-only commit, preserves the manual draft, and finalizes its capability', async t => {
    const source = await seed(t, {
      'selected.txt': 'before\n',
      'other.txt': 'other before\n',
    })
    await writeFile(join(source.path, 'selected.txt'), 'selected after\n')
    await writeFile(join(source.path, 'other.txt'), 'other after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const other = h
      .state(repository)
      .changesState.workingDirectory.files.find(
        file => file.path === 'other.txt'
      )
    assert.ok(other)
    await h.dispatcher.changeFileIncluded(repository, other, false)
    const draft = {
      ...DefaultCommitMessage,
      summary: 'Saved manual title',
      description: 'Saved manual body',
      timestamp: Date.now(),
    }
    await h.dispatcher.setCommitMessage(repository, draft)
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      draft
    )
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'selected.txt'),
      Buffer.from('selected after\n')
    )
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'other.txt'),
      Buffer.from('other before\n')
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'other.txt'), 'utf8'),
      'other after\n'
    )
    if (result.kind === 'local-ready') {
      await assert.rejects(
        rollbackAssistedCommitTransaction(result.result),
        error =>
          error instanceof AssistedCommitError && error.code === 'disposed'
      )
    }
  })

  it('executes a complete multi-commit plan and applies trailers and sign-off to every commit', async t => {
    const source = await seed(t, {
      'one.txt': 'one before\n',
      'two.txt': 'two before\n',
    })
    await writeFile(join(source.path, 'one.txt'), 'one after\n')
    await writeFile(join(source.path, 'two.txt'), 'two after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const input = h.request(repository, {
      trailers: [
        {
          token: 'Co-Authored-By',
          value: 'Known Author <known@example.invalid>',
        },
      ],
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      input
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(await count(repository), 3)
    assert.strictEqual(h.commits.mock.callCount(), 2)
    if (result.kind === 'local-ready') {
      for (const sha of result.result.commits) {
        const message = await rawGit(repository, [
          'show',
          '-s',
          '--format=%B',
          sha,
        ])
        assert.match(
          message,
          /Co-Authored-By: Known Author <known@example.invalid>/
        )
        assert.match(message, /Signed-off-by:/)
      }
    }
    assert.strictEqual(
      await readFile(join(repository.path, 'one.txt'), 'utf8'),
      'one after\n'
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'two.txt'), 'utf8'),
      'two after\n'
    )
  })

  it('creates Empty commit without consent, credentials, a model, or manual-draft changes', async t => {
    const source = await seed(t, { 'unselected.txt': 'before\n' })
    await writeFile(join(source.path, 'unselected.txt'), 'unselected after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    await h.dispatcher.changeIncludeAllFiles(repository, false)
    h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const draft = {
      ...DefaultCommitMessage,
      summary: 'Manual draft',
      description: 'Keep this',
      timestamp: Date.now(),
    }
    await h.dispatcher.setCommitMessage(repository, draft)
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(
      await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
      'Empty commit'
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.planner.createClient.mock.callCount(), 0)
    assert.strictEqual(
      h.appStore['popupManager'].areTherePopupsOfType(
        PopupType.AssistedCommitDisclaimer
      ),
      false
    )
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      draft
    )
    assert.strictEqual(h.state(repository).allowEmptyCommit, false)
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'unselected.txt'),
      Buffer.from('before\n')
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'unselected.txt'), 'utf8'),
      'unselected after\n'
    )
  })

  it('blocks duplicate and competing backend actions while analysis is pending', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const analyzing = deferred<void>()
    const stop = deferred<void>()
    h.propose.mock.mockImplementation(
      async (_account, analysis, _path, options) => {
        analyzing.resolve()
        await stop.promise
        if (options?.signal?.aborted) {
          throw new AssistedCommitError(
            'cancelled',
            'Cancelled synthetic analysis'
          )
        }
        return splitResponse(analysis)
      }
    )
    const run = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'busy'
    )
    assert.throws(
      () => h.dispatcher.setCommitMode(repository, 'manual'),
      /assisted commit run/
    )
    assert.throws(
      () =>
        h.dispatcher.updateCommitOptions(repository, {
          allowEmptyCommit: true,
        }),
      /assisted commit run/
    )
    await assert.rejects(
      h.appStore._discardChanges(
        repository,
        h.request(repository).files,
        false
      ),
      /assisted commit run/
    )
    const commit = h.state(repository).commitLookup.values().next().value
    assert.ok(commit)
    await assert.rejects(
      h.appStore._undoCommit(repository, commit, false),
      /assisted commit run/
    )
    h.cancel(repository)
    stop.resolve()
    assert.strictEqual((await run).kind, 'cancelled')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('cancel after the first commit removes every run commit and restores the original index and selection', async t => {
    const source = await seed(t, {
      'one.txt': 'before one\n',
      'two.txt': 'before two\n',
    })
    await writeFile(join(source.path, 'one.txt'), 'after one\n')
    await writeFile(join(source.path, 'two.txt'), 'after two\n')
    await rawGit(source, ['add', '--', 'two.txt'])
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    const originalSelections = h
      .request(repository)
      .files.map(file => file.selection)
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const subscription = h.appStore.onDidUpdate(() => {
      const state = h.state(repository).changesState.assistedCommit
      if (state.kind === 'committing' && state.index === 1) {
        h.cancel(repository)
      }
    })
    t.after(() => subscription.dispose())
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'cancelled')
    assert.strictEqual(await tip(repository), originalHead)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    h.request(repository).files.forEach((file, index) =>
      assert.ok(file.selection.equals(originalSelections[index]))
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'one.txt'), 'utf8'),
      'after one\n'
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'two.txt'), 'utf8'),
      'after two\n'
    )
  })

  it('Cancel after successful execution but before ready rolls back the successful result', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        h.cancel(repository)
      }
    })
    t.after(() => subscription.dispose())
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'cancelled')
    assert.strictEqual(await tip(repository), originalHead)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(h.request(repository).files.length, 1)
  })

  it('rejects selected-file changes during final reconciliation and rolls back the completed result', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const refresh = h.appStore['refreshAssistedCommitRepository'].bind(
      h.appStore
    )
    h.appStore['refreshAssistedCommitRepository'] = async (...args) => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        await writeFile(join(repository.path, 'file'), 'CURRENT user edit\n')
      }
      return refresh(...args)
    }
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(await tip(repository), originalHead)
    assert.strictEqual(
      await readFile(join(repository.path, 'file'), 'utf8'),
      'CURRENT user edit\n'
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('accepts assisted-specific consent, then performs the correct action without ordinary message generation', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
    t.after(() => popupReady.subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await popupReady.promise
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'awaiting-consent'
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
    assert.strictEqual(await count(repository), 1)
    const popup = h.appStore['popupManager'].currentPopup
    assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
    popup.onAccepted()
    const result = await operation
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      h.appStore['commitMessageGenerationDisclaimerLastSeen'],
      null
    )
    assert.ok(h.appStore['assistedCommitDisclaimerLastSeen'] !== null)
  })

  for (const action of [
    'decline',
    'cancel',
    'stale-selection',
    'stale-options',
  ] as const) {
    it(`starts nothing when assisted consent is ${action}`, async t => {
      const source = await seed(t, { 'one.txt': 'one\n', 'two.txt': 'two\n' })
      await writeFile(join(source.path, 'one.txt'), 'ONE\n')
      await writeFile(join(source.path, 'two.txt'), 'TWO\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.appStore['assistedCommitDisclaimerLastSeen'] = null
      const originalIndex = await optionalBytes(await indexPath(repository))
      const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
      t.after(() => popupReady.subscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      await popupReady.promise
      const popup = h.appStore['popupManager'].currentPopup
      assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
      if (action === 'decline') {
        assert.ok(popup.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      } else if (action === 'cancel') {
        h.cancel(repository)
      } else {
        if (action === 'stale-selection') {
          h.stores.repositoryStateCache.updateChangesState(
            repository,
            state => ({
              workingDirectory:
                state.workingDirectory.withIncludeAllFiles(false),
            })
          )
        } else {
          h.stores.repositoryStateCache.update(repository, () => ({
            signOffCommits: true,
          }))
        }

        popup.onAccepted()
      }
      const result = await operation
      assert.strictEqual(
        result.kind,
        action === 'decline'
          ? 'declined'
          : action === 'cancel'
          ? 'cancelled'
          : 'error'
      )
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
      assert.deepStrictEqual(
        await optionalBytes(await indexPath(repository)),
        originalIndex
      )
      assert.strictEqual(h.state(repository).isCommitting, false)
    })
  }

  it('rejects selected content changed while consent is open without capturing or analyzing it', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
    t.after(() => popupReady.subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await popupReady.promise
    await writeFile(join(repository.path, 'file'), 'new user content\n')
    const popup = h.appStore['popupManager'].currentPopup
    assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
    popup.onAccepted()
    const result = await operation
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'file'), 'utf8'),
      'new user content\n'
    )
  })

  it('keeps consent fresh for 30 days but never shares manual-generation consent', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['assistedCommitDisclaimerLastSeen'] =
      Date.now() - 29 * 24 * 60 * 60 * 1000
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    await writeFile(join(source.path, 'file.txt'), 'again\n')
    await h.appStore._loadStatus(repository)
    h.appStore['assistedCommitDisclaimerLastSeen'] =
      Date.now() - 31 * 24 * 60 * 60 * 1000
    h.appStore['commitMessageGenerationDisclaimerLastSeen'] = Date.now()
    const popupReady = awaitPopup(h, PopupType.AssistedCommitDisclaimer)
    t.after(() => popupReady.subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await popupReady.promise
    h.cancel(repository)
    assert.strictEqual((await operation).kind, 'cancelled')
  })

  it('captures different same-file hunks exactly once while excluding an unselected hunk', async t => {
    const base = Array.from({ length: 70 }, (_, index) => `line ${index + 1}\n`)
    const source = await seed(t, { 'file.txt': base.join('') })
    const changed = [...base]
    changed[1] = 'selected first\n'
    changed[30] = 'selected second\n'
    changed[60] = 'UNSELECTED\n'
    await writeFile(join(source.path, 'file.txt'), changed.join(''))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None)
    for (const hunk of diff.hunks.slice(0, 2)) {
      for (const [index, line] of hunk.lines.entries()) {
        if (line.isIncludeableLine()) {
          selection = selection.withLineSelection(
            hunk.unifiedDiffStart + index,
            true
          )
        }
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      assert.strictEqual(analysis.changes.length, 2)
      assert.ok(
        analysis.changes.every(change => !change.diff.includes('UNSELECTED'))
      )
      return splitResponse(analysis)
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(await count(repository), 3)
    const expected = [...base]
    expected[1] = changed[1]
    expected[30] = changed[30]
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'file.txt'),
      Buffer.from(expected.join(''))
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'file.txt'), 'utf8'),
      changed.join('')
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
  })

  it('uses one fresh entire-selection message for a valid but unsafe split through the real planner adapter', async t => {
    const source = await seed(t, { replaced: 'old file\n' })
    await unlink(join(source.path, 'replaced'))
    await mkdir(join(source.path, 'replaced'))
    await writeFile(join(source.path, 'replaced', 'child'), 'new child\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.restore()
    h.planner.send.mock.mockImplementation(async options => {
      const analysis = h.appStore['assistedCommitRuns'].get(repository.id)
        ?.snapshot?.analysis
      assert.ok(analysis)
      const addition = analysis.changes.find(
        change => change.path === 'replaced/child'
      )
      const deletion = analysis.changes.find(
        change => change.path === 'replaced'
      )
      assert.ok(addition && deletion)
      const content =
        h.planner.send.mock.callCount() === 0
          ? {
              kind: 'plan',
              snapshotId: analysis.snapshotId,
              commits: [
                { title: 'Add child alone', changeIds: [addition.id] },
                { title: 'Delete file alone', changeIds: [deletion.id] },
              ],
            }
          : wholeSelectionResponse(
              analysis,
              'Replace old file with child directory'
            )
      assert.ok(options.prompt.includes('replaced'))
      return assistantMessage(JSON.stringify(content))
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    if (result.kind === 'error') {
      assert.fail(
        assistedCommitErrorCauses(result.error)
          .map(cause => (cause instanceof Error ? cause.stack : String(cause)))
          .join('\n')
      )
    }
    assert.strictEqual(result.kind, 'local-ready')
    assert.strictEqual(h.planner.send.mock.callCount(), 2)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(
      await rawGit(repository, ['show', '-s', '--format=%s', 'HEAD']),
      'Replace old file with child directory'
    )
  })

  it('never treats invalid ownership, model quota, cleanup failure or wrapped cancellation as success', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalIndex = await optionalBytes(await indexPath(repository))
    h.propose.mock.mockImplementation(async (_account, analysis) => ({
      ...wholeSelectionResponse(analysis),
      commits: [{ title: 'Invalid', changeIds: ['unknown-id'] }],
    }))
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    assert.strictEqual(h.propose.mock.callCount(), 1)
    const payment = new CopilotError('Quota reached', 402, {
      paymentRequiredErrorCode: 'quota_exceeded',
      retryAfter: '60',
    })
    h.propose.mock.mockImplementation(async () => {
      throw new Error('SDK failed', { cause: payment })
    })
    const quota = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(quota.kind, 'error')
    if (quota.kind === 'error') {
      assert.ok(assistedCommitErrorCauses(quota.error).includes(payment))
    }
    h.propose.mock.mockImplementation(async () => {
      throw new CopilotAssistedCommitError(
        'cleanup-failed',
        'SDK cleanup failed',
        {
          cause: new CopilotAssistedCommitError('cancelled', 'Cancelled'),
          cleanupErrors: [new Error('FS cleanup failed')],
        }
      )
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    h.propose.mock.mockImplementation(async () => {
      h.cancel(repository)
      throw new Error('SDK wrapper', {
        cause: new CopilotAssistedCommitError('cancelled', 'Cancelled'),
      })
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'cancelled'
    )
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('reconciles changed selected text by original content anchors, never stale line offsets', async t => {
    const base = 'line one\nline two\nline three\nline four\n'
    const source = await seed(t, { 'file.txt': base })
    await writeFile(
      join(source.path, 'file.txt'),
      'line one\nSELECTED\nline three\nUNSELECTED\n'
    )
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None)
    for (const hunk of diff.hunks) {
      for (const [index, line] of hunk.lines.entries()) {
        if (line.type === DiffLineType.Add && line.content === 'SELECTED') {
          selection = selection.withLineSelection(
            hunk.unifiedDiffStart + index,
            true
          )
        }
      }
    }
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await writeFile(
        join(repository.path, 'file.txt'),
        'NEW UNSELECTED TOP\nline one\nSELECTED\nline three\nUNSELECTED\n'
      )
      return wholeSelectionResponse(analysis)
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    const currentFile =
      h.state(repository).changesState.workingDirectory.files[0]
    const currentDiff = await getWorkingDirectoryDiff(repository, currentFile)
    assert.ok(currentDiff.kind === DiffType.Text)
    const selected = currentDiff.hunks.flatMap(hunk =>
      hunk.lines
        .filter(
          (line, index) =>
            line.isIncludeableLine() &&
            currentFile.selection.isSelected(hunk.unifiedDiffStart + index)
        )
        .map(line => line.content)
    )
    assert.deepStrictEqual(selected, ['SELECTED'])
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(
      await readFile(join(repository.path, 'file.txt'), 'utf8'),
      'NEW UNSELECTED TOP\nline one\nSELECTED\nline three\nUNSELECTED\n'
    )
  })

  it('keeps newly renamed/deleted or ambiguous current content excluded, never restoring old bytes', async t => {
    const source = await seed(t, { 'file.txt': 'before\n' })
    await writeFile(join(source.path, 'file.txt'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await rename(
        join(repository.path, 'file.txt'),
        join(repository.path, 'moved.txt')
      )
      return wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'moved.txt'), 'utf8'),
      'selected\n'
    )
    assert.strictEqual(await count(repository), 1)
  })

  it('continues through unselected edits and coalesces Desktop status, indicator and diff readers', async t => {
    const source = await seed(t, { selected: 'before\n', other: 'other\n' })
    await writeFile(join(source.path, 'selected'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    let reader: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await writeFile(join(repository.path, 'other'), 'new unselected\n')
      reader = h.appStore._loadStatus(repository)
      await h.appStore._refreshRepository(repository)
      await h.appStore['refreshIndicatorForRepository'](repository)
      await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
      return wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    await reader
    assert.deepStrictEqual(
      await commitBytes(repository, 'HEAD', 'other'),
      Buffer.from('other\n')
    )
    assert.strictEqual(
      await readFile(join(repository.path, 'other'), 'utf8'),
      'new unselected\n'
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(file => file.path === 'other')
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
  })

  it('rejects an in-flight index writer before admission and captures only after it settles', async t => {
    const source = await seed(t, { selected: 'before\n', other: 'before\n' })
    await writeFile(join(source.path, 'selected'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    const writer = withRepositoryGitOperation(
      repository.path,
      'mutation',
      async () => {
        entered.resolve()
        await finish.promise
        await git(['add', '--', 'selected'], repository.path, 'existing-stage')
      }
    )
    await entered.promise
    const run = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await new Promise(resolve => setImmediate(resolve))
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual((await run).kind, 'busy')
    finish.resolve()
    await writer
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
  })

  it('keeps repository A and B run state and frozen repository/account intent independent', async t => {
    const first = await seed(t, { file: 'first\n' })
    const second = await seed(t, { file: 'second\n' })
    await writeFile(join(first.path, 'file'), 'FIRST\n')
    await writeFile(join(second.path, 'file'), 'SECOND\n')
    const h = await createAssistedCommitRunHarness(t)
    const repoA = await h.register(first)
    const repoB = await h.register(second)
    const firstPath = await realpath(repoA.path)
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis, path) => {
      if (path === firstPath) {
        analyzing.resolve()
        await finish.promise
      }
      return wholeSelectionResponse(
        analysis,
        path === firstPath ? 'First repository' : 'Second repository'
      )
    })
    const runA = h.dispatcher.createCopilotAssistedCommits(
      repoA,
      h.request(repoA)
    )
    await analyzing.promise
    h.appStore['selectedRepository'] = repoB
    assert.strictEqual(h.state(repoB).changesState.assistedCommit.kind, 'idle')
    assert.strictEqual(
      (await h.dispatcher.createCopilotAssistedCommits(repoB, h.request(repoB)))
        .kind,
      'local-ready'
    )
    assert.strictEqual(
      h.state(repoA).changesState.assistedCommit.kind,
      'analyzing'
    )
    finish.resolve()
    assert.strictEqual((await runA).kind, 'local-ready')
    assert.strictEqual(
      await rawGit(repoA, ['show', '-s', '--format=%s', 'HEAD']),
      'First repository'
    )
    assert.strictEqual(
      await rawGit(repoB, ['show', '-s', '--format=%s', 'HEAD']),
      'Second repository'
    )
  })

  for (const change of ['sign-out', 'disabled', 'token'] as const) {
    it(`stops active analysis when authorization becomes ${change}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        const account = makeCopilotAccount()
        h.appStore['accounts'] =
          change === 'sign-out'
            ? []
            : [
                new Account(
                  account.login,
                  account.endpoint,
                  change === 'token' ? 'changed-token' : account.token,
                  account.emails,
                  account.avatarURL,
                  account.id,
                  account.name,
                  account.plan,
                  account.copilotEndpoint,
                  change !== 'disabled',
                  account.features,
                  account.copilotLicenseType
                ),
              ]
        h.appStore['abortUnauthorizedAssistedCommitRuns']()
        return wholeSelectionResponse(analysis)
      })
      const result = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(result.kind, 'error')
      if (result.kind === 'error') {
        assert.match(result.error.message, /Copilot access changed/)
      }
      assert.strictEqual(await count(repository), 1)
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(h.commits.mock.callCount(), 0)
    })
  }

  it('retains exact recovery ownership on external history interference and safely retries only rollback', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    const originalTree = await rawGit(repository, [
      'rev-parse',
      `${originalHead}^{tree}`,
    ])
    let runTip: string | undefined
    let externalTip: string | undefined
    const observer = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    h.appStore['onAssistedCommitProgress'] = async (run, progress) => {
      observer(run, progress)
      if (progress.kind === 'committing' && progress.index === 1) {
        runTip = await tip(repository)
        externalTip = await rawGit(
          repository,
          ['commit-tree', originalTree, '-p', runTip],
          { stdin: 'External work\n' }
        )
        await rawGit(repository, [
          'update-ref',
          'refs/heads/external-work',
          externalTip,
        ])
        await rawGit(repository, ['update-ref', 'HEAD', externalTip, runTip])
      }
    }
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    const failure = h.state(repository).changesState.assistedCommit
    assert.ok(failure.kind === 'error' && failure.retry === 'recovery')
    assert.ok(failure.recovery?.retryToken)
    assert.strictEqual(failure.recovery.history, 'interfered')
    assert.strictEqual(h.state(repository).isCommitting, true)
    assert.strictEqual(await tip(repository), externalTip)
    assert.throws(
      () => h.dispatcher.setCommitMode(repository, 'manual'),
      /assisted commit run/
    )
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failure.runId
    )
    assert.strictEqual(await tip(repository), externalTip)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'error'
    )
    assert.ok(runTip && externalTip)
    await rawGit(repository, ['update-ref', 'HEAD', runTip, externalTip])
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failure.runId
    )
    assert.strictEqual(await tip(repository), originalHead)
    assert.strictEqual(
      await rawGit(repository, ['rev-parse', 'refs/heads/external-work']),
      externalTip
    )
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      originalIndex
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('preserves externally changed index bytes and reports retained recovery instead of overwriting them', async t => {
    const source = await seed(t, {
      one: 'one\n',
      two: 'two\n',
      other: 'other\n',
    })
    await writeFile(join(source.path, 'one'), 'changed one\n')
    await writeFile(join(source.path, 'two'), 'changed two\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalHead = await tip(repository)
    const originalIndex = await optionalBytes(await indexPath(repository))
    assert.ok(originalIndex)
    let changedIndex: Buffer | undefined
    const observer = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    h.appStore['onAssistedCommitProgress'] = async (run, progress) => {
      observer(run, progress)
      if (progress.kind === 'committing' && progress.index === 1) {
        changedIndex = Buffer.concat([
          originalIndex,
          Buffer.from('external-index-change'),
        ])
        await writeFile(await indexPath(repository), changedIndex)
      }
    }
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    const failure = h.state(repository).changesState.assistedCommit
    assert.ok(
      failure.kind === 'error' && failure.recovery?.index === 'interfered'
    )
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      changedIndex
    )
    assert.strictEqual(await tip(repository), originalHead)
    await writeFile(await indexPath(repository), originalIndex)
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failure.runId
    )
    const retried = h.state(repository).changesState.assistedCommit
    if (retried.kind === 'error') {
      assert.fail(
        assistedCommitErrorCauses(retried.error)
          .map(cause => (cause instanceof Error ? cause.stack : String(cause)))
          .join('\n')
      )
    }
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('retains newer manual drafts edited during analysis and clears filters only on accepted success', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.stores.repositoryStateCache.updateChangesState(repository, state => ({
      fileListFilter: { ...state.fileListFilter, filterText: 'file' },
    }))
    const newer = {
      ...DefaultCommitMessage,
      summary: 'New manual draft',
      description: 'Do not clear',
      timestamp: Date.now(),
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await h.dispatcher.setCommitMessage(repository, newer)
      assert.strictEqual(
        h.state(repository).changesState.fileListFilter.filterText,
        'file'
      )
      return wholeSelectionResponse(analysis)
    })
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.deepStrictEqual(
      h.state(repository).changesState.commitMessage,
      newer
    )
    assert.strictEqual(
      h.state(repository).changesState.fileListFilter.filterText,
      ''
    )
  })

  it('validates every generated message before history mutation, preserves instruction-shaped bodies, and includes sign-off in rules', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    const h = await createAssistedCommitRunHarness(t)
    const local = await h.register(source)
    const github = new GitHubRepository(
      'synthetic',
      new Owner('synthetic-owner', 'https://api.github.com', 99),
      123,
      false,
      'https://github.com/synthetic-owner/synthetic'
    )
    const repository = new Repository(
      local.path,
      local.id,
      github,
      false,
      null,
      {},
      false,
      local.gitDir
    )
    await h.appStore._loadStatus(repository)
    const rules = new RepoRulesInfo()
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'must start with feat:',
      matcher: message => message.startsWith('feat:'),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      const plan = splitResponse(analysis)
      return {
        ...plan,
        commits:
          plan.kind === 'plan'
            ? plan.commits.map((commit, index) => ({
                ...commit,
                title: index === 0 ? 'feat: first' : 'Invalid second',
              }))
            : [],
      }
    })
    const original = await tip(repository)
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'error'
    )
    assert.strictEqual(await tip(repository), original)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 2,
      humanDescription: 'must include Signed-off-by:',
      matcher: message => message.includes('Signed-off-by:'),
    })
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const body =
      'CUSTOM instruction body\n    Preserve indentation\n\nFinal paragraph.'
    h.propose.mock.mockImplementation(async (_account, analysis) => ({
      ...wholeSelectionResponse(
        analysis,
        'feat: follow repository instructions'
      ),
      commits: [
        {
          title: 'feat: follow repository instructions',
          description: body,
          changeIds: analysis.changes.map(change => change.id),
        },
      ],
    }))
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    if (result.kind === 'error') {
      assert.fail(result.error.message)
    }
    assert.strictEqual(result.kind, 'local-ready')
    const message = await rawGit(repository, [
      'show',
      '-s',
      '--format=%B',
      'HEAD',
    ])
    assert.ok(message.includes(body))
    assert.match(message, /Signed-off-by:/)
  })

  it('keeps progress and Cancel attached to repository identity when refreshed metadata changes its hash', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise
    const updated = new Repository(
      repository.path,
      repository.id,
      null,
      false,
      'New alias',
      {},
      false,
      repository.gitDir
    )
    assert.notStrictEqual(updated.hash, repository.hash)
    assert.strictEqual(
      h.state(updated).changesState.assistedCommit.kind,
      'analyzing'
    )
    h.cancel(updated)
    finish.resolve()
    assert.strictEqual((await operation).kind, 'cancelled')
    assert.strictEqual(
      h.state(updated).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(await count(repository), 1)
  })

  it('gates unavailable runtime before consent, capture or analysis', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.runtime.mock.mockImplementation(async () => false)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(isRepositoryGitPaused(repository.path), false)
    assert.strictEqual(h.appStore['popupManager'].currentPopup, null)
  })
})
