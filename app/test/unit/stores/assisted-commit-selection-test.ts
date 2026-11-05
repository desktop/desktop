import { TestContext, it, describe } from 'node:test'
import { Repository } from '../../../src/models/repository'
import { join } from 'path'
import { createTempDirectory } from '../../helpers/temp'
import { writeFile, unlink } from 'fs/promises'
import {
  rawGit,
  optionalBytes,
  indexPath,
  count,
  seed,
} from '../../helpers/assisted-commit'
import {
  partialSelectionFixture,
  createAssistedCommitRunHarness,
} from '../../helpers/assisted-commit-run'
import { PopupType } from '../../../src/models/popup'
import assert from 'node:assert'
import {
  DiffSelectionType,
  DiffType,
  DiffSelection,
} from '../../../src/models/diff'
import { isolateGitConfig } from '../../helpers/git-config'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import {
  wholeSelectionResponse,
  deferred,
} from '../../helpers/copilot-assisted-commit'

async function configurePrefixTextconv(t: TestContext, repository: Repository) {
  const script = join(await createTempDirectory(t), 'prefix-textconv.cjs')
  await writeFile(
    script,
    "const fs = require('fs'); process.stdout.write(fs.readFileSync(process.argv[2], 'utf8').replace(/\\r\\n/g, '\\n').split(/(?<=\\n)/).slice(0, 20).join(''))"
  )
  const command = `"${process.execPath.replace(/\\/g, '/')}" "${script.replace(
    /\\/g,
    '/'
  )}"`
  await rawGit(repository, ['config', 'diff.prefix.textconv', command])
  await writeFile(join(repository.path, '.gitattributes'), 'file diff=prefix\n')
}

describe('AppStore assisted commit selection authority', () => {
  it('rejects an initial partial mask whose new middle hunk predates the first assisted click', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    const changed = [...current]
    changed[25] = 'NEW unauthorized before first click\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    const index = await optionalBytes(await indexPath(repository))
    h.assisted.dialogs['lastConsent'] = null
    const subscription = h.appStore.onDidUpdate(() => {
      const popup = h.appStore['popupManager'].currentPopup
      if (popup?.type === PopupType.AssistedCommitDisclaimer) {
        popup.onAccepted()
      }
    })
    t.after(() => subscription.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.doesNotMatch(
      await rawGit(repository, ['show', 'HEAD:file']),
      /NEW unauthorized before first click/
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      index
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('rejects a stale initial partial basis before preparing its first-click intent', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    const changed = [...current]
    changed[25] = 'NEW unauthorized preflight\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    await assert.rejects(
      h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      ),
      /partial|selected/i
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('does not authorize an unverifiable initial partial basis', async t => {
    const { h, repository } = await partialSelectionFixture(t, 1)
    const request = h.request(repository)
    h.assisted.selections['bases'].delete(request.files[0].selection)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      request
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('does not promote an initial partial mask into whole-file authority after textconv hides excluded hunks', async t => {
    const { h, repository } = await partialSelectionFixture(t, 0)
    await configurePrefixTextconv(t, repository)
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.doesNotMatch(
      await rawGit(repository, ['show', 'HEAD:file']),
      /selected suffix/
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
  })

  for (const autocrlf of [false, true]) {
    it(`retains initial partial lineage through Manual display promotion until explicit whole-file reselection with core.autocrlf=${autocrlf}`, async t => {
      await isolateGitConfig(t)
      const { h, repository } = await partialSelectionFixture(t, 0)
      await rawGit(repository, [
        'config',
        '--local',
        'core.autocrlf',
        String(autocrlf),
      ])
      assert.strictEqual(
        h.request(repository).files[0].selection.getSelectionType(),
        DiffSelectionType.Partial
      )
      h.dispatcher.setCommitMode(repository, 'manual')
      await configurePrefixTextconv(t, repository)
      await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
      const displayed = await getWorkingDirectoryDiff(
        repository,
        h.request(repository).files[0]
      )
      assert.ok(displayed.kind === DiffType.Text)
      assert.strictEqual(displayed.hunks.length, 1)
      assert.strictEqual(
        displayed.hunks[0].lines.filter(line => line.isIncludeableLine())
          .length,
        2
      )
      assert.match(displayed.text, /selected prefix/)
      assert.doesNotMatch(displayed.text, /selected suffix|\r/)
      assert.strictEqual(
        h.request(repository).files[0].selection.getSelectionType(),
        DiffSelectionType.All
      )
      await rawGit(repository, ['config', '--unset', 'diff.prefix.textconv'])
      await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
      h.dispatcher.setCommitMode(repository, 'copilot')
      const stopped = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(stopped.kind, 'error')
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
      const failure = h.state(repository).changesState.assistedCommit
      if (failure.kind === 'error' && failure.retry === 'refresh') {
        await h.dispatcher.retryCopilotAssistedCommitRecovery(
          repository,
          failure.runId
        )
      }
      const settled = h.state(repository).changesState.assistedCommit
      assert.ok(
        settled.kind === 'idle' ||
          (settled.kind === 'error' && settled.retry === null)
      )
      const current = h
        .state(repository)
        .changesState.workingDirectory.files.find(file => file.path === 'file')
      assert.ok(current !== undefined)
      await h.dispatcher.changeFileIncluded(repository, current, true)
      assert.strictEqual(
        (
          await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
        ).kind,
        'local-ready'
      )
      assert.strictEqual(await count(repository), 2)
      assert.match(
        await rawGit(repository, ['show', 'HEAD:file']),
        /selected suffix/
      )
    })
  }

  it('does not manufacture an initial partial basis during Manual display refresh', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    h.dispatcher.setCommitMode(repository, 'manual')
    const selected = h.request(repository).files[0]
    h.assisted.selections['bases'].delete(selected.selection)
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
    h.dispatcher.setCommitMode(repository, 'copilot')
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('does not attach a settled planner error to later Manual display-basis invalidation', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Synthetic settled planner failure')
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const settled = h.state(repository).changesState.assistedCommit
    assert.ok(
      settled.kind === 'error' && settled.retry === null,
      settled.kind === 'error'
        ? `${settled.retry}: ${assistedCommitErrorCauses(settled.error)
            .map(error =>
              error instanceof Error ? error.message : String(error)
            )
            .join(' | ')}`
        : settled.kind
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    await configurePrefixTextconv(t, repository)
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
    const current = h.state(repository).changesState.assistedCommit
    assert.ok(current.kind === 'error' && current.retry === null)
    assert.strictEqual(await count(repository), 1)
  })

  it('cancellation independently reconciles selected content changed before cancellation won', async t => {
    const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`)
    const source = await seed(t, { file: base.join('') })
    const changed = [...base]
    changed[29] = 'SELECTED\n'
    await writeFile(join(source.path, 'file'), changed.join(''))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const file = h.request(repository).files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    let selection = DiffSelection.fromInitialSelection(DiffSelectionType.None)
    for (const hunk of diff.hunks) {
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
      const current = [...changed]
      current[9] = 'NEW unselected\n'
      await writeFile(join(repository.path, 'file'), current.join(''))
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
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
    assert.ok(selected.includes('SELECTED'))
    assert.ok(!selected.includes('NEW unselected'), JSON.stringify(selected))
    assert.strictEqual(await count(repository), 1)
  })

  it('locks known stale pre-capture selection until refresh or explicit reselection', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
      repository,
      h.request(repository)
    )
    await writeFile(
      join(repository.path, 'file'),
      'new content before capture\n'
    )
    await h.dispatcher.createCopilotAssistedCommits(repository, request)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'busy'
    )
  })

  it('rechecks all selected versions after awaited recovery diffs before installing selections', async t => {
    const source = await seed(t, { a: 'before a\n', b: 'before b\n' })
    await writeFile(join(source.path, 'a'), 'selected a\n')
    await writeFile(join(source.path, 'b'), 'selected b\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const recoveryDiff = h.assisted.selections['getRecoveryDiff'].bind(
      h.assisted.selections
    )
    h.assisted.selections['getRecoveryDiff'] = async (repo, file) => {
      const diff = await recoveryDiff(repo, file)
      if (file.path === 'a') {
        await writeFile(join(repository.path, 'b'), 'new unselected b\n')
      }
      return diff
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await writeFile(
        join(repository.path, 'a'),
        'selected a\nnew unselected a\n'
      )
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.strictEqual(await count(repository), 1)
  })

  it(
    'does not reconcile a transformed prefix display into full-file selection',
    { skip: __WIN32__ },
    async t => {
      const source = await seed(t, { file: 'before\nunchanged suffix\n' })
      await writeFile(join(source.path, '.gitattributes'), 'file diff=prefix\n')
      await rawGit(source, ['config', 'diff.prefix.textconv', 'head -n 1'])
      await writeFile(
        join(source.path, 'file'),
        'selected prefix\nunchanged suffix\n'
      )
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const attributes = h
        .state(repository)
        .changesState.workingDirectory.files.find(
          file => file.path === '.gitattributes'
        )
      assert.ok(attributes)
      await h.dispatcher.changeFileIncluded(repository, attributes, false)
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        await writeFile(
          join(repository.path, 'file'),
          'selected prefix\nNEW UNSELECTED SUFFIX\n'
        )
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(
        h
          .state(repository)
          .changesState.workingDirectory.files.every(
            file => file.selection.getSelectionType() === DiffSelectionType.None
          )
      )
      assert.strictEqual(await count(repository), 1)
    }
  )

  it('never treats rejected capture anchors as authorized current selection', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'first selection\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const progress = h.assisted.context['progress'].bind(h.assisted.context)
    h.assisted.context['progress'] = async (run, step) => {
      progress(run, step)
      if (step.kind === 'capturing') {
        await writeFile(
          join(repository.path, 'file'),
          'new unauthorized capture\n'
        )
      }
    }
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(
      state.kind === 'error' &&
        (state.retry === 'refresh' || state.selectionNeedsReview)
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it(
    'excludes an unchanged partial selection when unselected attributes change its display basis',
    { skip: __WIN32__ },
    async t => {
      const base = Array.from(
        { length: 60 },
        (_, index) => `line ${index + 1}\n`
      )
      const source = await seed(t, { file: base.join('') })
      await rawGit(source, ['config', 'diff.prefix.textconv', 'head -n 20'])
      const current = [...base]
      current[3] = 'selected prefix\n'
      current[49] = 'unselected suffix\n'
      await writeFile(join(source.path, 'file'), current.join(''))
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const file = h.request(repository).files[0]
      const diff = await getWorkingDirectoryDiff(repository, file)
      assert.ok(diff.kind === DiffType.Text && diff.hunks.length === 2)
      let selection = file.selection
      for (const [index, line] of diff.hunks[1].lines.entries()) {
        if (line.isIncludeableLine()) {
          selection = selection.withLineSelection(
            diff.hunks[1].unifiedDiffStart + index,
            false
          )
        }
      }
      assert.strictEqual(
        selection.getSelectionType(),
        DiffSelectionType.Partial
      )
      await h.dispatcher.changeFileLineSelection(repository, file, selection)
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        await writeFile(
          join(repository.path, '.gitattributes'),
          'file diff=prefix\n'
        )
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(outcome.kind, 'error')
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error' && state.selectionNeedsReview)
      assert.ok(
        h
          .state(repository)
          .changesState.workingDirectory.files.every(
            file => file.selection.getSelectionType() === DiffSelectionType.None
          )
      )
      assert.strictEqual(await count(repository), 1)
    }
  )

  it(
    'keeps restored canonical partial authority through a later transformed display installation',
    { skip: __WIN32__ },
    async t => {
      const { h, repository } = await partialSelectionFixture(t)
      await rawGit(repository, ['config', 'diff.prefix.textconv', 'head -n 20'])
      const restore = h.assisted.recovery['restore'].bind(h.assisted.recovery)
      h.assisted.recovery['restore'] = async (...args) => {
        const result = await restore(...args)
        await writeFile(
          join(repository.path, '.gitattributes'),
          'file diff=prefix\n'
        )
        return result
      }
      let reader: Promise<unknown> | undefined
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        reader = h.appStore._loadStatus(repository)
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      await reader
      assert.strictEqual(outcome.kind, 'error')
      assert.ok(
        h
          .state(repository)
          .changesState.workingDirectory.files.every(
            file => file.selection.getSelectionType() === DiffSelectionType.None
          )
      )
      assert.strictEqual(await count(repository), 1)
    }
  )

  it('invalidates ownerless restored selections when their next reader fails', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
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
    assert.strictEqual(h.assisted.state['runs'].has(repository.id), false)
    const next = [...current]
    next[1] = 'new earlier unselected\n'
    await writeFile(join(repository.path, 'file'), next.join(''))
    const failure = new Error('Synthetic ownerless reader failure')
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    t.mock.method(gitStore, 'loadStatus', async () => {
      throw failure
    })
    await assert.rejects(
      h.appStore._loadStatus(repository),
      error => error === failure
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('certifies restored partial masks for nondisplayed files before ownerless status or admission', async t => {
    const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`)
    const source = await seed(t, { a: base.join(''), b: base.join('') })
    const current = [...base]
    current[3] = 'unselected prefix\n'
    current[49] = 'selected suffix\n'
    await writeFile(join(source.path, 'a'), current.join(''))
    await writeFile(join(source.path, 'b'), current.join(''))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    for (const file of h.request(repository).files) {
      const diff = await getWorkingDirectoryDiff(repository, file)
      assert.ok(diff.kind === DiffType.Text && diff.hunks.length === 2)
      let selection = file.selection
      for (const [index, line] of diff.hunks[0].lines.entries()) {
        if (line.isIncludeableLine()) {
          selection = selection.withLineSelection(
            diff.hunks[0].unifiedDiffStart + index,
            false
          )
        }
      }
      await h.dispatcher.changeFileLineSelection(repository, file, selection)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const next = [...current]
    next[29] = 'NEW unselected middle\n'
    await writeFile(join(repository.path, 'b'), next.join(''))
    await h.appStore._loadStatus(repository).catch(error => error)
    const b = h
      .state(repository)
      .changesState.workingDirectory.files.find(file => file.path === 'b')
    assert.strictEqual(b?.selection.getSelectionType(), DiffSelectionType.None)
    assert.strictEqual(await count(repository), 1)
  })

  it('transfers restored partial authority into a subsequent authorized snapshot instead of rolling it back', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
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
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      wholeSelectionResponse(analysis)
    )
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.commits.mock.callCount(), 1)
  })

  it('consumes restored partial authority only after a successful Manual commit', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const cancelled = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(cancelled.kind, 'cancelled')
    h.dispatcher.setCommitMode(repository, 'manual')
    const errors: Error[] = []
    const subscription = h.appStore.onDidError(error => errors.push(error))
    t.after(() => subscription.dispose())
    const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(h.appStore)
    let refreshed: Promise<void> | undefined
    h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
      refreshed = refresh(...args)
      return refreshed
    }
    try {
      assert.strictEqual(
        await h.appStore._commitIncludedChanges(repository, {
          summary: 'Manual retained selection',
          description: '',
          trailers: [],
        }),
        true
      )
    } finally {
      await refreshed
    }
    assert.deepStrictEqual(errors, [])
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.commits.mock.callCount(), 1)
  })

  it('retains restored partial authority when a native Manual commit fails', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    const selected = h.request(repository).files[0]
    const lock = `${await indexPath(repository)}.lock`
    await writeFile(lock, 'Owned failure-injection lock\n')
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    let refreshed: Promise<void> | undefined
    h.appStore._refreshRepository = (...args) => {
      refreshed = refresh(...args)
      return refreshed
    }
    try {
      assert.strictEqual(
        await h.appStore._commitIncludedChanges(repository, {
          summary: 'Must retain failed selection',
          description: '',
          trailers: [],
        }),
        false
      )
      await refreshed
    } finally {
      await unlink(lock)
    }
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.ok(h.assisted.selections['restored'].has(selected.selection))
  })

  it('rejects captured Manual masks invalidated while resource admission awaits', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    const index = await optionalBytes(await indexPath(repository))
    const admitted = deferred<void>()
    const finish = deferred<void>()
    const resources = h.appStore['withAssistedCommitMutationResources'].bind(
      h.appStore
    )
    h.appStore['withAssistedCommitMutationResources'] = (repo, operation) =>
      resources(repo, async () => {
        admitted.resolve()
        await finish.promise
        return operation()
      })
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    const refreshes: Promise<void>[] = []
    h.appStore._refreshRepository = (...args) => {
      const refreshing = refresh(...args)
      refreshes.push(refreshing)
      return refreshing
    }
    const committing = h.appStore._commitIncludedChanges(repository, {
      summary: 'Must not commit superseded lines',
      description: '',
      trailers: [],
    })
    await admitted.promise
    const changed = [...current]
    changed[25] = 'NEW unauthorized middle hunk\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    await h.appStore._loadStatus(repository)
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    finish.resolve()
    let committed: boolean
    try {
      committed = await committing
    } finally {
      await Promise.all(refreshes)
    }
    assert.doesNotMatch(
      await rawGit(repository, ['show', 'HEAD:file']),
      /NEW unauthorized middle hunk/
    )
    assert.strictEqual(committed, false)
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      index
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
    assert.strictEqual(
      (await optionalBytes(join(repository.path, 'file')))?.toString(),
      changed.join('')
    )
  })

  it('never remaps certified Manual partial masks onto a fresh diff after admission', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    const certify = h.assisted.selections['verifyManual'].bind(
      h.assisted.selections
    )
    const changed = [...current]
    changed[25] = 'NEW unauthorized after certification\n'
    h.assisted.selections['verifyManual'] = async (...args) => {
      const result = await certify(...args)
      await writeFile(join(repository.path, 'file'), changed.join(''))
      return result
    }
    const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(h.appStore)
    let refreshed: Promise<void> | undefined
    h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
      refreshed = refresh(...args)
      return refreshed
    }
    try {
      await h.appStore._commitIncludedChanges(repository, {
        summary: 'Commit certified original suffix',
        description: '',
        trailers: [],
      })
    } finally {
      await refreshed
    }
    const committed = await rawGit(repository, ['show', 'HEAD:file'])
    assert.doesNotMatch(committed, /NEW unauthorized after certification/)
    assert.match(committed, /selected suffix/)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(
      (await optionalBytes(join(repository.path, 'file')))?.toString(),
      changed.join('')
    )
  })

  it('retains unchanged whole-file authority until explicit reselection', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await writeFile(join(repository.path, 'file'), 'NEW unauthorized content\n')
    await h.appStore._loadStatus(repository).catch(error => error)
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
    assert.strictEqual(await count(repository), 1)
  })

  it('settles partial whitespace display incompatibility without an endless refresh retry', async t => {
    const { h, repository } = await partialSelectionFixture(t, 0, true)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.appStore['hideWhitespaceInChangesDiff'] = true
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    let state = h.state(repository).changesState.assistedCommit
    if (state.kind === 'error' && state.retry === 'refresh') {
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        state.runId
      )
      state = h.state(repository).changesState.assistedCommit
    }
    assert.ok(
      state.kind === 'idle' || (state.kind === 'error' && state.retry === null)
    )
    assert.strictEqual(await count(repository), 1)
  })
})
