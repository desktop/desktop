import assert from 'node:assert'
import { describe, it, TestContext } from 'node:test'
import { chmod, mkdir, rename, unlink, writeFile } from 'fs/promises'
import { writeFileSync } from 'fs'
import { join, relative } from 'path'
import { Repository } from '../../../src/models/repository'
import { TipState } from '../../../src/models/tip'
import { GitHubRepository } from '../../../src/models/github-repository'
import { Owner } from '../../../src/models/owner'
import { RepoRulesInfo } from '../../../src/models/repo-rules'
import { createTempDirectory } from '../../helpers/temp'
import { getCopilotAccountCacheKey } from '../../../src/lib/stores/copilot-store'
import { makeCopilotAccount } from '../../helpers/copilot-assisted-commit'
import {
  AppFileStatusKind,
  WorkingDirectoryFileChange,
} from '../../../src/models/status'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  count,
  indexPath,
  optionalBytes,
  rawGit,
  seed,
} from '../../helpers/assisted-commit'
import {
  deferred,
  splitResponse,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import { git } from '../../../src/lib/git/core'
import {
  acquireAssistedCommitGitLease,
  hasRepositoryGitOperationAccess,
  withRepositoryGitOperation,
  isRepositoryAffectedByAssistedCommit,
  protectAssistedCommitResources,
} from '../../../src/lib/git/repository-operation'
import {
  DiffSelection,
  DiffSelectionType,
  DiffType,
} from '../../../src/models/diff'
import { PopupType } from '../../../src/models/popup'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { ipcRenderer } from 'electron'
import { TokenStore } from '../../../src/lib/stores/token-store'
import { UncommittedChangesStrategy } from '../../../src/models/uncommitted-changes-strategy'
import { clone } from '../../../src/lib/git/clone'
import { StatsStore } from '../../../src/lib/stats'

async function partialSelectionFixture(
  t: TestContext,
  selectedHunk = 0,
  whitespaceSuffix = false
) {
  const base = Array.from({ length: 60 }, (_, index) => `line ${index + 1}\n`)
  const source = await seed(t, { file: base.join('') })
  const current = [...base]
  current[3] = 'selected prefix\n'
  current[49] = whitespaceSuffix ? 'line 50    \n' : 'selected suffix\n'
  await writeFile(join(source.path, 'file'), current.join(''))
  const h = await createAssistedCommitRunHarness(t)
  const repository = await h.register(source)
  const file = h.request(repository).files[0]
  const diff = await getWorkingDirectoryDiff(repository, file)
  assert.ok(diff.kind === DiffType.Text && diff.hunks.length === 2)
  let selection = file.selection
  for (const [hunkIndex, hunk] of diff.hunks.entries()) {
    if (hunkIndex !== selectedHunk) {
      for (const [index, line] of hunk.lines.entries()) {
        if (line.isIncludeableLine()) {
          selection = selection.withLineSelection(
            hunk.unifiedDiffStart + index,
            false
          )
        }
      }
    }
  }
  await h.dispatcher.changeFileLineSelection(repository, file, selection)
  return { h, repository, current }
}

async function configurePrefixTextconv(t: TestContext, repository: Repository) {
  const script = join(await createTempDirectory(t), 'prefix-textconv.cjs')
  await writeFile(
    script,
    "const fs = require('fs'); process.stdout.write(fs.readFileSync(process.argv[2], 'utf8').split(/(?<=\\n)/).slice(0, 20).join(''))"
  )
  const command = `"${process.execPath.replace(/\\/g, '/')}" "${script.replace(
    /\\/g,
    '/'
  )}"`
  await rawGit(repository, ['config', 'diff.prefix.textconv', command])
  await writeFile(join(repository.path, '.gitattributes'), 'file diff=prefix\n')
}

describe('assisted run hostile review regressions', () => {
  it('rejects an initial partial mask whose new middle hunk predates the first assisted click', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    const changed = [...current]
    changed[25] = 'NEW unauthorized before first click\n'
    await writeFile(join(repository.path, 'file'), changed.join(''))
    const index = await optionalBytes(await indexPath(repository))
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
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
    h.appStore['workingDirectorySelectionDiffs'].delete(
      request.files[0].selection
    )
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

  it('retains initial partial lineage through Manual display promotion until explicit whole-file reselection', async t => {
    const { h, repository } = await partialSelectionFixture(t, 0)
    h.dispatcher.setCommitMode(repository, 'manual')
    await configurePrefixTextconv(t, repository)
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
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

  it('does not manufacture an initial partial basis during Manual display refresh', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    h.dispatcher.setCommitMode(repository, 'manual')
    const selected = h.request(repository).files[0]
    h.appStore['workingDirectorySelectionDiffs'].delete(selected.selection)
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

  it('terminal chunks, GitStore updates and AppStore errors never grant observer mutation access', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const lease = await acquireAssistedCommitGitLease(repository.path)
    t.after(() => lease.release())
    const access: boolean[] = []
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const update = gitStore.onDidUpdate(() =>
      access.push(hasRepositoryGitOperationAccess(repository.path))
    )
    const error = h.appStore.onDidError(() =>
      access.push(hasRepositoryGitOperationAccess(repository.path))
    )
    t.after(() => {
      update.dispose()
      error.dispose()
    })
    await lease.run(async () => {
      await git(['rev-parse', 'HEAD'], repository.path, 'terminal-observer', {
        onTerminalOutputAvailable: subscribe => {
          subscribe(() =>
            access.push(hasRepositoryGitOperationAccess(repository.path))
          )
        },
      })
      gitStore['emitUpdate']()
      h.appStore['emitError'](new Error('Synthetic observer error'))
    })
    assert.ok(access.length >= 3)
    assert.ok(
      access.every(value => value === false),
      JSON.stringify(access)
    )
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

  for (const operation of ['delete', 'move'] as const) {
    it(`guards the ${operation} target worktree even when invoked through another repository`, async t => {
      const source = await seed(t, { file: 'source\n' })
      const target = await seed(t, { file: 'target\n' })
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const lease = await acquireAssistedCommitGitLease(target.path)
      t.after(() => lease.release())
      let entered = false
      h.appStore['deleteWorktreeCore'] = async () => {
        entered = true
      }
      h.appStore['moveWorktreeCore'] = async () => {
        entered = true
      }
      await assert.rejects(
        operation === 'delete'
          ? h.appStore._deleteWorktree(repository, target.path, true)
          : h.appStore._moveWorktree(
              repository,
              target.path,
              `${target.path}-moved`
            ),
        /assisted commit run/
      )
      assert.strictEqual(entered, false)
    })
  }

  it('rejects captured branch identity changed to another ref at the same commit', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const shown = deferred<void>()
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.appStore['popupManager'].currentPopup?.type ===
        PopupType.AssistedCommitDisclaimer
      ) {
        shown.resolve()
      }
    })
    t.after(() => subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await shown.promise
    await rawGit(repository, ['switch', '-c', 'different'])
    const popup = h.appStore['popupManager'].currentPopup
    assert.ok(popup?.type === PopupType.AssistedCommitDisclaimer)
    popup.onAccepted()
    const result = await operation
    assert.strictEqual(result.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('queues ordinary hook failures behind an assisted prompt without losing their resolver', async t => {
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
    try {
      const run = h.appStore['assistedCommitRuns'].get(repository.id)
      assert.ok(run)
      const assisted = h.appStore['onAssistedCommitHookFailure'](
        run,
        'assisted-hook',
        'output'
      )
      const ordinary = h.appStore['onHookFailure'](() => {})(
        'ordinary-hook',
        'output'
      )
      const first = h.appStore['popupManager'].currentPopup
      assert.ok(first?.type === PopupType.HookFailed)
      first.resolve('ignore')
      assert.strictEqual(await assisted, 'ignore')
      const second = h.appStore['popupManager'].currentPopup
      assert.ok(
        second?.type === PopupType.HookFailed &&
          second.hookName === 'ordinary-hook'
      )
      second.resolve('abort')
      assert.strictEqual(await ordinary, 'abort')
    } finally {
      h.cancel(repository)
      finish.resolve()
      await operation
    }
  })

  it('does not suppress an independent reconciliation failure behind domain cancellation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const failure = new Error('Status reconciliation unavailable')
    h.appStore['restoreAssistedCommitSelection'] = async () => {
      throw failure
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const result = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(result.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.ok(assistedCommitErrorCauses(state.error).includes(failure))
    assert.strictEqual(await count(repository), 1)
  })

  it('keeps actual deferred refresh failure reachable after recovery without a disposed replacement', async t => {
    const source = await seed(t, { one: 'one\n', two: 'two\n' })
    await writeFile(join(source.path, 'one'), 'ONE\n')
    await writeFile(join(source.path, 'two'), 'TWO\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const originalIndex = await optionalBytes(await indexPath(repository))
    assert.ok(originalIndex)
    const observer = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    h.appStore['onAssistedCommitProgress'] = async (run, progress) => {
      observer(run, progress)
      if (progress.kind === 'committing' && progress.index === 1) {
        await writeFile(
          await indexPath(repository),
          Buffer.concat([originalIndex, Buffer.from('interference')])
        )
      }
    }
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const failed = h.state(repository).changesState.assistedCommit
    assert.ok(failed.kind === 'error' && failed.retry === 'recovery')
    await writeFile(await indexPath(repository), originalIndex)
    h.appStore['restoreAssistedCommitSelection'] = async () => false
    const refreshError = new Error('Post-recovery refresh failed')
    h.appStore._refreshRepository = async () => {
      throw refreshError
    }
    h.appStore['deferredAssistedCommitRefreshes'].set(repository.id, repository)
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failed.runId
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.ok(assistedCommitErrorCauses(state.error).includes(refreshError))
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('rejects new selected content introduced while snapshot capture is starting', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'first selection\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const progress = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    h.appStore['onAssistedCommitProgress'] = async (run, step) => {
      progress(run, step)
      if (step.kind === 'capturing') {
        await writeFile(
          join(repository.path, 'file'),
          'new unauthorized content\n'
        )
      }
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('expected cancellation does not throw out of account reconciliation', async t => {
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
    h.cancel(repository)
    try {
      assert.doesNotThrow(() =>
        h.appStore['abortUnauthorizedAssistedCommitRuns']()
      )
    } finally {
      finish.resolve()
      await operation
    }
  })

  it(
    'requires reselection after a newly introduced executable mode change during cancellation',
    { skip: __WIN32__ },
    async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        await chmod(join(repository.path, 'file'), 0o755)
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      const state = h.state(repository)
      assert.ok(
        state.changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
      )
      assert.ok(
        state.changesState.assistedCommit.kind === 'error' &&
          state.changesState.assistedCommit.selectionNeedsReview
      )
    }
  )

  it('does not auto-select a new unselected edit discovered in a later finishing status read', async t => {
    const source = await seed(t, {
      selected: 'before\n',
      other: 'before other\n',
    })
    await writeFile(join(source.path, 'selected'), 'selected now\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    h.appStore._refreshRepository = async repo => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        await writeFile(
          join(repository.path, 'other'),
          'new unselected finishing edit\n'
        )
      }
      return refresh(repo)
    }
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
  })

  it('propagates required reader failures during finishing rather than silently accepting failable-operation defaults', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const original = gitStore.loadLocalCommits.bind(gitStore)
    const failed = new Error('Required history reconciliation failed')
    gitStore.loadLocalCommits = async (...args) => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'finishing'
      ) {
        await gitStore.performFailableOperation(async () => {
          throw failed
        })
        return null
      }
      return original(...args)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
    if (outcome.kind === 'error') {
      assert.ok(assistedCommitErrorCauses(outcome.error).includes(failed))
    }
  })

  for (const changed of ['content', 'branch'] as const) {
    it(`rejects first-click intent after ${changed} changes while a warning is open`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'original selected content\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const prepared = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      if (changed === 'content') {
        await writeFile(
          join(repository.path, 'file'),
          'replacement selected content\n'
        )
      } else {
        await rawGit(repository, ['switch', '-c', 'warning-changed-branch'])
        await h.appStore._loadStatus(repository)
      }
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        prepared
      )
      assert.strictEqual(outcome.kind, 'error')
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
    })
  }

  it('cannot remove shared main Git metadata while a linked worktree run owns it', async t => {
    const source = await seed(t, { file: 'before\n' })
    const linked = await createTempDirectory(t)
    await rawGit(source, ['worktree', 'add', '-b', 'linked', linked])
    await writeFile(join(linked, 'file'), 'linked selection\n')
    const h = await createAssistedCommitRunHarness(t)
    const main = await h.register(source)
    const target = await h.register(new Repository(linked, -1, null, false))
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      target,
      h.request(target)
    )
    await analyzing.promise
    let removed = false
    h.appStore['removeRepositoryCore'] = async () => {
      removed = true
    }
    try {
      await assert.rejects(
        h.appStore._removeRepository(main, true),
        /assisted commit run/
      )
      assert.strictEqual(removed, false)
    } finally {
      h.cancel(target)
      finish.resolve()
      await operation
    }
  })

  it('validates sign-off against frozen execution configuration, not a changed live committer', async t => {
    const previousName = process.env.GIT_COMMITTER_NAME
    const previousEmail = process.env.GIT_COMMITTER_EMAIL
    delete process.env.GIT_COMMITTER_NAME
    delete process.env.GIT_COMMITTER_EMAIL
    t.after(() => {
      if (previousName === undefined) {
        delete process.env.GIT_COMMITTER_NAME
      } else {
        process.env.GIT_COMMITTER_NAME = previousName
      }
      if (previousEmail === undefined) {
        delete process.env.GIT_COMMITTER_EMAIL
      } else {
        process.env.GIT_COMMITTER_EMAIL = previousEmail
      }
    })
    const source = await seed(t, { file: 'before\n' })
    await rawGit(source, ['config', 'user.name', 'Original Signer'])
    await rawGit(source, ['config', 'user.email', 'original@example.invalid'])
    await writeFile(join(source.path, 'file'), 'selected\n')
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
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const rules = new RepoRulesInfo()
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'requires changed signer',
      matcher: message =>
        message.includes(
          'Signed-off-by: Changed Signer <changed@example.invalid>'
        ),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      await rawGit(repository, ['config', 'user.name', 'Changed Signer'])
      await rawGit(repository, [
        'config',
        'user.email',
        'changed@example.invalid',
      ])
      return wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('locks refresh-only errors until current selections have been reconciled', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['restoreAssistedCommitSelection'] = async () => {
      throw new Error('Refresh unavailable')
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
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
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'error'
    )
  })

  it('validates native body-less messages without fabricating a blank separator', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
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
      humanDescription: 'exact body-less title',
      matcher: message => /^feat: test\n?$/.test(message),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      wholeSelectionResponse(analysis, 'feat: test')
    )
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.strictEqual(await count(repository), 2)
  })

  it('releases history request keys after a strict reader fails', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const operation = gitStore.performFailableOperation.bind(gitStore)
    gitStore.performFailableOperation = async () => {
      throw new Error('Synthetic required reader failure')
    }
    await assert.rejects(gitStore.loadCommitBatch('HEAD', 0), /reader failure/)
    gitStore.performFailableOperation = operation
    const commits = await gitStore.loadCommitBatch('HEAD', 0)
    assert.ok(commits !== null && commits.length === 1)
  })

  it('reconciles visible changes and draft into a refreshed repository representation after cancellation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    await h.dispatcher.setCommitMessage(repository, {
      summary: 'Keep draft',
      description: 'Keep body',
      timestamp: Date.now(),
    })
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const run = h.dispatcher.createCopilotAssistedCommits(
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
    h.appStore['selectedRepository'] = updated
    await h.appStore._refreshRepository(updated)
    h.cancel(updated)
    finish.resolve()
    await run
    assert.strictEqual(
      h.state(updated).changesState.workingDirectory.files.length,
      1
    )
    assert.strictEqual(
      h.state(updated).changesState.commitMessage.summary,
      'Keep draft'
    )
  })

  for (const mutation of ['delete', 'move', 'discard'] as const) {
    it(`rejects ${mutation} of an ancestor containing a protected active descendant`, async t => {
      const main = await seed(t, { file: 'main\n' })
      const ancestor = join(main.path, 'nested')
      await mkdir(ancestor)
      const child = await seed(t, { file: 'child\n' })
      const childPath = join(ancestor, 'nested-repository')
      await rename(child.path, childPath)
      await mkdir(child.path)
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(main)
      const protectedPaths = [childPath]
      const lease = await acquireAssistedCommitGitLease(
        childPath,
        protectedPaths
      )
      t.after(() => lease.release())
      let entered = false
      h.appStore['deleteWorktreeCore'] = async () => {
        entered = true
      }
      h.appStore['moveWorktreeCore'] = async () => {
        entered = true
      }
      h.appStore['discardChangesCore'] = async () => {
        entered = true
      }
      const targetRelative = relative(repository.path, ancestor)
      const operation =
        mutation === 'delete'
          ? h.appStore._deleteWorktree(repository, ancestor, true)
          : mutation === 'move'
          ? h.appStore._moveWorktree(repository, ancestor, `${ancestor}-moved`)
          : h.appStore._discardChanges(
              repository,
              [
                new WorkingDirectoryFileChange(
                  targetRelative,
                  { kind: AppFileStatusKind.Untracked },
                  DiffSelection.fromInitialSelection(DiffSelectionType.All)
                ),
              ],
              true
            )
      await assert.rejects(operation, /assisted commit run/)
      assert.strictEqual(entered, false)
    })
  }

  for (const change of ['deleted', 'changed'] as const) {
    it(`rejects a prepared BYOK definition that was ${change}, never switching to default`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const provider = {
        id: 'synthetic-provider',
        name: 'Synthetic',
        type: 'openai' as const,
        baseUrl: 'http://127.0.0.1:1',
        authKind: 'none' as const,
        models: [{ id: 'synthetic-model', name: 'Synthetic model' }],
      }
      h.appStore['byokProviders'] = [provider]
      h.appStore['selectedCopilotModelsByAccount'] = new Map([
        [
          getCopilotAccountCacheKey(makeCopilotAccount()),
          {
            'commit-message-generation':
              'byok:synthetic-provider:synthetic-model',
          },
        ],
      ])
      const request = await h.dispatcher.prepareCopilotAssistedCommitRequest(
        repository,
        h.request(repository)
      )
      h.appStore['byokProviders'] =
        change === 'deleted'
          ? []
          : [{ ...provider, baseUrl: 'http://127.0.0.1:2' }]
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        request
      )
      assert.strictEqual(outcome.kind, 'error')
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
    })
  }

  it('keeps exclusion association for a status reader queued before its run is removed', async t => {
    const source = await seed(t, {
      selected: 'before\n',
      other: 'before other\n',
    })
    await writeFile(join(source.path, 'selected'), 'selected now\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    let status: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      status = h.appStore._loadStatus(repository)
      return wholeSelectionResponse(analysis)
    })
    const refresh = h.appStore['refreshAssistedCommitRepository'].bind(
      h.appStore
    )
    h.appStore['refreshAssistedCommitRepository'] = async (...args) => {
      await refresh(...args)
      if (args[1]) {
        await writeFile(
          join(repository.path, 'other'),
          'late unselected edit\n'
        )
      }
    }
    assert.strictEqual(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
      ).kind,
      'local-ready'
    )
    await status
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.every(
          file => file.selection.getSelectionType() === DiffSelectionType.None
        )
    )
  })

  it('guards a file inside a protected working directory, not only its ancestor root', async t => {
    const source = await seed(t, { file: 'before\n' })
    const nested = await seed(t, { file: 'nested\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const lease = await acquireAssistedCommitGitLease(nested.path)
    t.after(() => lease.release())
    let entered = false
    h.appStore['discardChangesCore'] = async () => {
      entered = true
    }
    const file = new WorkingDirectoryFileChange(
      relative(repository.path, join(nested.path, 'file')),
      { kind: AppFileStatusKind.Modified },
      DiffSelection.fromInitialSelection(DiffSelectionType.All)
    )
    await assert.rejects(
      h.appStore._discardChanges(repository, [file], false),
      /assisted commit run/
    )
    assert.strictEqual(entered, false)
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

  it('keeps old teardown admission closed through its awaited deferred refresh', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refreshing = deferred<void>()
    const finish = deferred<void>()
    let waiting = false
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    h.appStore._refreshRepository = async repo => {
      const run = h.appStore['assistedCommitRuns'].get(repository.id)
      if (
        !waiting &&
        run?.reconciling &&
        !h.appStore['deferredAssistedCommitRefreshes'].has(repository.id)
      ) {
        waiting = true
        refreshing.resolve()
        await finish.promise
      }
      return refresh(repo)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.appStore['deferredAssistedCommitRefreshes'].set(
        repository.id,
        repository
      )
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await refreshing.promise
    try {
      assert.strictEqual(
        (
          await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
        ).kind,
        'busy'
      )
    } finally {
      finish.resolve()
      await operation
    }
  })

  it('rejects strict status exit-128 instead of returning null', async t => {
    const missingGit = await createTempDirectory(t)
    const h = await createAssistedCommitRunHarness(t)
    const repository = new Repository(missingGit, 999, null, false)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    await assert.rejects(
      gitStore.loadStatus({ propagateErrors: true }),
      /not a git repository/i
    )
  })

  it('registers consent cancellation before publishing awaiting-consent to reentrant observers', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const cancellationObserved = deferred<void>()
    let cancelled = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !cancelled &&
        h.state(repository).changesState.assistedCommit.kind ===
          'awaiting-consent'
      ) {
        cancelled = true
        h.cancel(repository)
        cancellationObserved.resolve()
      }
    })
    t.after(() => subscription.dispose())
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await cancellationObserved.promise
    assert.strictEqual((await operation).kind, 'cancelled')
  })

  it('rechecks all selected versions after awaited recovery diffs before installing selections', async t => {
    const source = await seed(t, { a: 'before a\n', b: 'before b\n' })
    await writeFile(join(source.path, 'a'), 'selected a\n')
    await writeFile(join(source.path, 'b'), 'selected b\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const recoveryDiff = h.appStore['getAssistedCommitRecoveryDiff'].bind(
      h.appStore
    )
    h.appStore['getAssistedCommitRecoveryDiff'] = async (repo, file) => {
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

  it('retains latest user commit inputs across three metadata hashes', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const a = await h.register(source)
    h.dispatcher.setCoAuthors(a, [
      {
        kind: 'known',
        name: 'Old author',
        email: 'old@example.invalid',
        username: null,
      },
    ])
    const b = new Repository(
      a.path,
      a.id,
      null,
      false,
      'Alias B',
      {},
      false,
      a.gitDir
    )
    h.dispatcher.setCoAuthors(b, [
      {
        kind: 'known',
        name: 'New author',
        email: 'new@example.invalid',
        username: null,
      },
    ])
    await h.dispatcher.setCommitMessage(b, {
      summary: 'Newest manual draft',
      description: 'Keep',
      timestamp: Date.now(),
    })
    const c = new Repository(
      a.path,
      a.id,
      null,
      false,
      'Alias C',
      {},
      false,
      a.gitDir
    )
    await h.appStore._loadStatus(c)
    assert.strictEqual(h.state(c).changesState.coAuthors[0]?.kind, 'known')
    assert.deepStrictEqual(
      h.state(c).changesState.coAuthors,
      h.state(b).changesState.coAuthors
    )
    assert.strictEqual(
      h.state(c).changesState.commitMessage.summary,
      'Newest manual draft'
    )
  })

  it('validates native sign-off even when configurable interpret-trailers would drop it', async t => {
    const source = await seed(t, { file: 'before\n' })
    await rawGit(source, ['config', 'trailer.ifMissing', 'doNothing'])
    await writeFile(join(source.path, 'file'), 'selected\n')
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
    h.dispatcher.updateCommitOptions(repository, { signOffCommits: true })
    const rules = new RepoRulesInfo()
    rules.commitMessagePatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'requires sign-off',
      matcher: message => message.includes('Signed-off-by:'),
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.match(
      await rawGit(repository, ['show', '-s', '--format=%B', 'HEAD']),
      /Signed-off-by:/
    )
  })

  it('rejects frozen committer-email rules before any assisted history mutation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
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
    rules.committerEmailPatterns.push({
      enforced: true,
      rulesetId: 1,
      humanDescription: 'denies this committer',
      matcher: () => false,
    })
    h.stores.repositoryStateCache.updateChangesState(repository, () => ({
      currentRepoRulesInfo: rules,
    }))
    const index = await optionalBytes(await indexPath(repository))
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    if (outcome.kind === 'error') {
      assert.match(outcome.error.message, /committer/)
    }
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      index
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('settles a successful refresh retry even when its idle observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const restore = h.appStore['restoreAssistedCommitSelection'].bind(
      h.appStore
    )
    h.appStore['restoreAssistedCommitSelection'] = async () => {
      throw new Error('Synthetic initial restoration failure')
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    h.appStore['restoreAssistedCommitSelection'] = restore
    let threw = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !threw &&
        h.state(repository).changesState.assistedCommit.kind === 'idle'
      ) {
        threw = true
        throw new Error('Synthetic successful retry notification failure')
      }
    })
    t.after(() => subscription.dispose())
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(threw, true)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].has(repository.id),
      false
    )
    assert.strictEqual(await count(repository), 1)
  })

  for (const mode of ['manual', 'assisted'] as const) {
    it(`preserves successful ${mode} completion after the actual statistics database closes`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.updateCommitOptions(repository, { allowEmptyCommit: true })
      await h.dispatcher.setCommitMessage(repository, {
        summary: 'Saved manual draft',
        description: 'Saved body',
        timestamp: Date.now(),
      })
      const record = StatsStore.prototype.recordCommit.bind(h.statsStore)
      h.commits.mock.mockImplementation(async () => {
        h.statsStore['db'].close()
        try {
          await record()
        } finally {
          await h.statsStore['db'].open()
        }
      })
      const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(
        h.appStore
      )
      let refreshed: Promise<void> | undefined
      h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
        refreshed = refresh(...args)
        return refreshed
      }
      try {
        if (mode === 'manual') {
          h.dispatcher.setCommitMode(repository, 'manual')
          assert.strictEqual(
            await h.appStore._commitIncludedChanges(repository, {
              summary: 'Manual committed title',
              description: '',
              trailers: [],
            }),
            true
          )
        } else {
          const outcome = await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
          assert.strictEqual(outcome.kind, 'local-ready')
        }
      } finally {
        await refreshed
      }
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(h.state(repository).allowEmptyCommit, false)
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(
        h.state(repository).changesState.commitMessage.summary,
        mode === 'manual' ? '' : 'Saved manual draft'
      )
    })
  }

  for (const exit of ['cancel', 'decline'] as const) {
    it(`invalidates content drift on pre-capture ${exit} independently of cancellation classification`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.appStore['assistedCommitDisclaimerLastSeen'] = null
      const shown = deferred<void>()
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          h.appStore['popupManager'].currentPopup?.type ===
          PopupType.AssistedCommitDisclaimer
        ) {
          shown.resolve()
        }
      })
      t.after(() => subscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      await shown.promise
      await writeFile(join(repository.path, 'file'), 'new unselected content\n')
      if (exit === 'cancel') {
        h.cancel(repository)
      } else {
        const popup = h.appStore['popupManager'].currentPopup
        assert.ok(popup?.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      }
      const outcome = await operation
      assert.strictEqual(outcome.kind, 'error')
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'error' && state.retry === 'refresh')
      assert.strictEqual(h.propose.mock.callCount(), 0)
    })
  }

  it('resumes working-directory diffs after a settled planning failure when returning to manual', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Synthetic planner failure')
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
    h.dispatcher.setCommitMode(repository, 'manual')
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
    const selection = h.state(repository).changesState.selection
    assert.ok(selection.kind === 'WorkingDirectory' && selection.diff !== null)
  })

  it('blocks parent checkout while a descendant repository owns selected working bytes', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const nested = join(source.path, 'nested')
    await mkdir(nested)
    const lease = await acquireAssistedCommitGitLease(nested)
    t.after(() => lease.release())
    const branch = h.state(repository).branchesState.tip
    assert.ok(branch.kind === TipState.Valid)
    let entered = false
    h.appStore['checkoutBranchCore'] = async () => {
      entered = true
      return repository
    }
    await assert.rejects(
      h.appStore._checkoutBranch(repository, branch.branch),
      /assisted commit run/
    )
    assert.strictEqual(entered, false)
  })

  it('cancels reader draining without waiting behind its own acquired lease', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    const reader = withRepositoryGitOperation(
      repository.path,
      'read',
      async () => {
        entered.resolve()
        await finish.promise
      }
    )
    await entered.promise
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await new Promise(resolve => setTimeout(resolve, 100))
    h.cancel(repository)
    finish.resolve()
    await reader
    const outcome = await Promise.race([
      operation.then(result => result.kind),
      new Promise<string>(resolve =>
        setTimeout(() => resolve('pending'), 2000)
      ),
    ])
    assert.strictEqual(outcome, 'cancelled')
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it('never treats rejected capture anchors as authorized current selection', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'first selection\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const progress = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    h.appStore['onAssistedCommitProgress'] = async (run, step) => {
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

  it('blocks active branch rename through a peer linked worktree with the same common metadata', async t => {
    const main = await seed(t, { file: 'before\n' })
    const bPath = await createTempDirectory(t)
    const cPath = await createTempDirectory(t)
    await rawGit(main, ['worktree', 'add', '-b', 'run-branch', bPath])
    await rawGit(main, ['worktree', 'add', '-b', 'peer-branch', cPath])
    await writeFile(join(bPath, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const b = await h.register(new Repository(bPath, -1, null, false))
    const c = await h.register(new Repository(cPath, -1, null, false))
    const analyzing = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      analyzing.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(b, h.request(b))
    await analyzing.promise
    const tip = h.state(b).branchesState.tip
    assert.ok(tip.kind === TipState.Valid)
    let entered = false
    h.appStore['renameBranchCore'] = async () => {
      entered = true
    }
    try {
      await assert.rejects(
        h.appStore._renameBranch(c, tip.branch, 'renamed-run'),
        /assisted commit run/
      )
      assert.strictEqual(entered, false)
    } finally {
      h.cancel(b)
      finish.resolve()
      await operation
    }
  })

  it('does not retain mutation protection for a settled nonretry planning error', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Settled planning failure')
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    let entered = false
    h.appStore['discardChangesCore'] = async () => {
      entered = true
    }
    await h.appStore._discardChanges(
      repository,
      h.request(repository).files,
      false
    )
    assert.strictEqual(entered, true)
  })

  it('makes stale hook resolver settlement idempotent without consuming a later prompt', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
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
    try {
      const run = h.appStore['assistedCommitRuns'].get(repository.id)
      assert.ok(run)
      const first = h.appStore['onAssistedCommitHookFailure'](
        run,
        'first',
        'output'
      )
      const popup = h.appStore['popupManager'].currentPopup
      assert.ok(popup?.type === PopupType.HookFailed)
      const stale = popup.resolve
      stale('ignore')
      assert.strictEqual(await first, 'ignore')
      const next = h.appStore['onAssistedCommitHookFailure'](
        run,
        'next',
        'output'
      )
      stale('abort')
      const current = h.appStore['popupManager'].currentPopup
      assert.ok(
        current?.type === PopupType.HookFailed && current.hookName === 'next'
      )
      current.resolve('abort')
      assert.strictEqual(await next, 'abort')
    } finally {
      h.cancel(repository)
      finish.resolve()
      await operation
    }
  })

  it('allows ordinary compound create-and-checkout in a linked worktree', async t => {
    const main = await seed(t, { file: 'before\n' })
    const linked = await createTempDirectory(t)
    await rawGit(main, ['worktree', 'add', '-b', 'linked', linked])
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(new Repository(linked, -1, null, false))
    await h.appStore._createBranch(repository, 'created-in-linked', 'HEAD')
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', '--short', 'HEAD']),
      'created-in-linked'
    )
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

  for (const action of ['retry', 'dismiss'] as const) {
    it(`preserves a replacement run started by an idle subscriber during ${action}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const restore = h.appStore['restoreAssistedCommitSelection'].bind(
        h.appStore
      )
      if (action === 'retry') {
        h.appStore['restoreAssistedCommitSelection'] = async () => {
          throw new Error('Synthetic reconciliation failure')
        }
        h.propose.mock.mockImplementation(async (_account, analysis) => {
          h.cancel(repository)
          return wholeSelectionResponse(analysis)
        })
      } else {
        h.propose.mock.mockImplementation(async () => {
          throw new Error('Synthetic planning failure')
        })
      }
      await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      const failure = h.state(repository).changesState.assistedCommit
      assert.ok(failure.kind === 'error')
      assert.strictEqual(failure.retry, action === 'retry' ? 'refresh' : null)
      h.appStore['restoreAssistedCommitSelection'] = restore
      h.propose.mock.mockImplementation(async (_account, analysis) =>
        wholeSelectionResponse(analysis)
      )
      let replacement:
        | ReturnType<typeof h.dispatcher.createCopilotAssistedCommits>
        | undefined
      let started = false
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          !started &&
          h.state(repository).changesState.assistedCommit.kind === 'idle'
        ) {
          started = true
          replacement = h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
        }
      })
      t.after(() => subscription.dispose())
      if (action === 'retry') {
        await h.dispatcher.retryCopilotAssistedCommitRecovery(
          repository,
          failure.runId
        )
      } else {
        h.dispatcher.dismissCopilotAssistedCommitError(
          repository,
          failure.runId
        )
      }
      assert.ok(replacement)
      assert.strictEqual((await replacement).kind, 'local-ready')
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(await count(repository), 2)
    })
  }

  it('opens Locate for a vanished repository without querying the missing Git directory', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const moved = join(await createTempDirectory(t), 'moved')
    await rename(repository.path, moved)
    const dialog = t.mock.method(ipcRenderer, 'invoke', async () => null)
    try {
      await h.appStore._relocateRepository(repository)
      assert.strictEqual(dialog.mock.callCount(), 1)
      assert.strictEqual(dialog.mock.calls[0].arguments[0], 'show-open-dialog')
    } finally {
      await rename(moved, repository.path)
    }
  })

  it('resumes automatic history file and diff loading after a rolled-back finishing failure', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refresh = h.appStore['refreshAssistedCommitRepository'].bind(
      h.appStore
    )
    h.appStore['refreshAssistedCommitRepository'] = async (
      repo,
      afterSuccess
    ) => {
      if (afterSuccess) {
        throw new Error('Synthetic finishing refresh failure')
      }
      return refresh(repo, afterSuccess)
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === null)
    const run = h.appStore['assistedCommitRuns'].get(repository.id)
    assert.ok(
      run?.finished && run.result !== undefined && run.lease === undefined
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    const sha = await rawGit(repository, ['rev-parse', 'HEAD'])
    await h.appStore['updateOrSelectFirstCommit'](repository, [sha])
    const selected = h.state(repository).commitSelection
    assert.deepStrictEqual(selected.shas, [sha])
    assert.strictEqual(selected.changesetData.files.length, 1)
    assert.ok(selected.file !== null && selected.diff !== null)
  })

  it('keeps Dismiss from abandoning an unfinished error owner during teardown refresh', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refreshing = deferred<void>()
    const finish = deferred<void>()
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    let paused = false
    h.appStore._refreshRepository = async repo => {
      if (
        !paused &&
        h.state(repository).changesState.assistedCommit.kind === 'error'
      ) {
        paused = true
        refreshing.resolve()
        await finish.promise
        throw new Error('Synthetic teardown refresh failure')
      }
      return refresh(repo)
    }
    h.propose.mock.mockImplementation(async () => {
      h.appStore['deferredAssistedCommitRefreshes'].set(
        repository.id,
        repository
      )
      throw new Error('Synthetic planning failure')
    })
    const operation = h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .then(
        result => ({ result }),
        error => ({ error })
      )
    await refreshing.promise
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    const preserved = h.appStore['assistedCommitRuns'].has(repository.id)
    finish.resolve()
    const outcome = await operation
    assert.strictEqual(preserved, true)
    assert.ok('result' in outcome && outcome.result.kind === 'error')
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(await count(repository), 1)
  })

  it('fences uncaptured cancellation after awaited HEAD verification, not only before it', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    const verifyHead = h.appStore['assertAssistedCommitCapturedHead'].bind(
      h.appStore
    )
    let changed = false
    h.appStore['assertAssistedCommitCapturedHead'] = (run, head) => {
      verifyHead(run, head)
      if (!changed) {
        changed = true
        const next = [...current]
        next[1] = 'new earlier unselected\n'
        // eslint-disable-next-line no-sync
        writeFileSync(join(repository.path, 'file'), next.join(''))
      }
    }
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.state(repository).changesState.assistedCommit.kind ===
        'awaiting-consent'
      ) {
        h.cancel(repository)
      }
    })
    t.after(() => subscription.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.selectionNeedsReview)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it(
    'keeps restored canonical partial authority through a later transformed display installation',
    { skip: __WIN32__ },
    async t => {
      const { h, repository } = await partialSelectionFixture(t)
      await rawGit(repository, ['config', 'diff.prefix.textconv', 'head -n 20'])
      const restore = h.appStore['restoreAssistedCommitSelection'].bind(
        h.appStore
      )
      h.appStore['restoreAssistedCommitSelection'] = async (...args) => {
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

  it('keeps mutations blocked through a released associated reader before final publication', async t => {
    const { h, repository, current } = await partialSelectionFixture(t, 1)
    const entered = deferred<void>()
    const finish = deferred<void>()
    const loadDiff = h.appStore['updateChangesWorkingDirectoryDiffCore'].bind(
      h.appStore
    )
    let owned: ReturnType<typeof h.appStore['assistedCommitRuns']['get']>
    let paused = false
    h.appStore['updateChangesWorkingDirectoryDiffCore'] = async repo => {
      if (!paused && owned !== undefined && owned.lease === undefined) {
        paused = true
        entered.resolve()
        await finish.promise
      }
      return loadDiff(repo)
    }
    let reader: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      owned = h.appStore['assistedCommitRuns'].get(repository.id)
      reader = h.appStore._loadStatus(repository)
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    try {
      const next = [...current]
      next[1] = 'new earlier unselected\n'
      await writeFile(join(repository.path, 'file'), next.join(''))
      await assert.rejects(
        h.appStore._commitIncludedChanges(repository, {
          summary: 'Must not commit during verification',
          description: '',
          trailers: [],
        }),
        /assisted commit/
      )
    } finally {
      finish.resolve()
      await operation
      await reader
    }
    assert.strictEqual(await count(repository), 1)
  })

  for (const change of ['definition', 'credential'] as const) {
    it(`revokes active BYOK analysis after its ${change} changes, without accepting commits`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const provider = {
        id: 'synthetic-provider',
        name: 'Synthetic',
        type: 'openai' as const,
        baseUrl: 'http://127.0.0.1:1',
        authKind: 'apiKey' as const,
        models: [{ id: 'synthetic-model', name: 'Synthetic model' }],
      }
      t.mock.method(TokenStore, 'getItem', async () => 'synthetic-key')
      t.mock.method(TokenStore, 'deleteItem', async () => true)
      h.appStore['byokProviders'] = [provider]
      h.appStore['selectedCopilotModelsByAccount'] = new Map([
        [
          getCopilotAccountCacheKey(makeCopilotAccount()),
          {
            'commit-message-generation':
              'byok:synthetic-provider:synthetic-model',
          },
        ],
      ])
      const entered = deferred<void>()
      const finish = deferred<void>()
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        entered.resolve()
        await finish.promise
        return wholeSelectionResponse(analysis)
      })
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      await entered.promise
      await h.appStore._updateCopilotBYOKProvider(
        change === 'definition'
          ? { ...provider, baseUrl: 'http://127.0.0.1:2' }
          : provider,
        change === 'credential' ? null : undefined
      )
      finish.resolve()
      const outcome = await operation
      assert.strictEqual(outcome.kind, 'error')
      assert.strictEqual(await count(repository), 1)
    })
  }

  it('resumes the current Changes diff immediately after verified analysis cancellation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'cancelled')
    const selection = h.state(repository).changesState.selection
    assert.ok(selection.kind === 'WorkingDirectory' && selection.diff !== null)
  })

  it('preserves an associated reader failure after release instead of reporting quiet cancellation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const load = gitStore.loadStatus.bind(gitStore)
    const failure = new Error('Synthetic released status failure')
    let owned: ReturnType<typeof h.appStore['assistedCommitRuns']['get']>
    gitStore.loadStatus = async (...args) => {
      if (owned !== undefined && owned.lease === undefined) {
        throw failure
      }
      return load(...args)
    }
    let reader: Promise<unknown> | undefined
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      owned = h.appStore['assistedCommitRuns'].get(repository.id)
      reader = h.appStore._loadStatus(repository).catch(error => error)
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(await reader, failure)
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.ok(assistedCommitErrorCauses(state.error).includes(failure))
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('rolls back earlier local commits when their frozen BYOK provider is revoked', async t => {
    const source = await seed(t, { one: 'before one\n', two: 'before two\n' })
    await writeFile(join(source.path, 'one'), 'selected one\n')
    await writeFile(join(source.path, 'two'), 'selected two\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const index = await optionalBytes(await indexPath(repository))
    const provider = {
      id: 'synthetic-provider',
      name: 'Synthetic',
      type: 'openai' as const,
      baseUrl: 'http://127.0.0.1:1',
      authKind: 'none' as const,
      models: [{ id: 'synthetic-model', name: 'Synthetic model' }],
    }
    h.appStore['byokProviders'] = [provider]
    h.appStore['selectedCopilotModelsByAccount'] = new Map([
      [
        getCopilotAccountCacheKey(makeCopilotAccount()),
        {
          'commit-message-generation':
            'byok:synthetic-provider:synthetic-model',
        },
      ],
    ])
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    const progress = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    let revoked = false
    h.appStore['onAssistedCommitProgress'] = async (run, step) => {
      progress(run, step)
      if (step.kind === 'committing' && step.index === 1) {
        assert.strictEqual(await count(repository), 2)
        revoked = true
        await h.appStore._updateCopilotBYOKProvider(
          { ...provider, baseUrl: 'http://127.0.0.1:2' },
          undefined
        )
      }
    }
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(revoked, true)
    assert.strictEqual(outcome.kind, 'error')
    assert.strictEqual(await count(repository), 1)
    assert.deepStrictEqual(
      await optionalBytes(await indexPath(repository)),
      index
    )
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

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
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].has(repository.id),
      false
    )
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

  it('protects accepted physical resources through released-reader settlement across repository IDs', async t => {
    const parentSource = await seed(t, { parent: 'parent\n' })
    const childSource = await seed(t, { file: 'before\n' })
    const childPath = join(parentSource.path, 'nested')
    await rename(childSource.path, childPath)
    await mkdir(childSource.path)
    await writeFile(join(childPath, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const child = await h.register(new Repository(childPath, -1, null, false))
    const parent = await h.register(parentSource)
    const entered = deferred<void>()
    const finish = deferred<void>()
    const load = h.appStore['updateChangesWorkingDirectoryDiffCore'].bind(
      h.appStore
    )
    let owned: ReturnType<typeof h.appStore['assistedCommitRuns']['get']>
    let paused = false
    h.appStore['updateChangesWorkingDirectoryDiffCore'] = async repo => {
      if (
        repo.id === child.id &&
        !paused &&
        owned?.finalized &&
        owned.lease === undefined
      ) {
        paused = true
        entered.resolve()
        await finish.promise
      }
      return load(repo)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      owned = h.appStore['assistedCommitRuns'].get(child.id)
      return wholeSelectionResponse(analysis)
    })
    let discarded = false
    h.appStore['discardChangesCore'] = async () => {
      discarded = true
    }
    const operation = h.dispatcher.createCopilotAssistedCommits(
      child,
      h.request(child)
    )
    await entered.promise
    const affected = isRepositoryAffectedByAssistedCommit(parent.path)
    const outcome = await h.appStore
      ._discardChanges(
        parent,
        [
          new WorkingDirectoryFileChange(
            'nested',
            { kind: AppFileStatusKind.Untracked },
            DiffSelection.fromInitialSelection(DiffSelectionType.All)
          ),
        ],
        false
      )
      .then(
        () => null,
        error => error
      )
    finish.resolve()
    assert.strictEqual((await operation).kind, 'local-ready')
    assert.strictEqual(affected, true)
    assert.ok(
      outcome instanceof Error && /assisted commit/i.test(outcome.message)
    )
    assert.strictEqual(discarded, false)
    assert.strictEqual(await count(child), 2)
  })

  it('still aborts Cancel when its synchronous update observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    const owned = h.appStore['assistedCommitRuns'].get(repository.id)
    assert.ok(owned)
    let threw = false
    const subscription = h.appStore.onDidUpdate(() => {
      const state = h.state(repository).changesState.assistedCommit
      if (!threw && state.kind === 'analyzing' && state.cancelRequested) {
        threw = true
        throw new Error('Synthetic Cancel observer failure')
      }
    })
    t.after(() => subscription.dispose())
    assert.throws(() => h.cancel(repository), /Cancel observer failure/)
    const aborted = owned.controller.signal.aborted
    finish.resolve()
    await operation
    assert.strictEqual(aborted, true)
    assert.strictEqual(await count(repository), 1)
  })

  it('settles ownership after the initial preparing observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    let threw = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !threw &&
        h.state(repository).changesState.assistedCommit.kind === 'preparing'
      ) {
        threw = true
        throw new Error('Synthetic preparing observer failure')
      }
    })
    t.after(() => subscription.dispose())
    await h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .catch(error => error)
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].get(repository.id)?.finished,
      true
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
  })

  it('keeps retry ownership settled when its first observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const restore = h.appStore['restoreAssistedCommitSelection'].bind(
      h.appStore
    )
    h.appStore['restoreAssistedCommitSelection'] = async () => {
      throw new Error('Synthetic refresh failure')
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    h.appStore['restoreAssistedCommitSelection'] = restore
    let threw = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !threw &&
        h.state(repository).changesState.assistedCommit.kind === 'refreshing'
      ) {
        threw = true
        throw new Error('Synthetic retry observer failure')
      }
    })
    await h.dispatcher
      .retryCopilotAssistedCommitRecovery(repository, state.runId)
      .catch(error => error)
    subscription.dispose()
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].get(repository.id)?.finished,
      true
    )
    assert.strictEqual(h.state(repository).isCommitting, false)
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
  })

  it('retains a reader admitted during final fence verification until its result settles', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const fenceEntered = deferred<void>()
    const finishFence = deferred<void>()
    const readerEntered = deferred<void>()
    const finishReader = deferred<void>()
    const verify = h.appStore['verifyAssistedCommitSelectionFence'].bind(
      h.appStore
    )
    let paused = false
    h.appStore['verifyAssistedCommitSelectionFence'] = async run => {
      if (
        !paused &&
        run.lease === undefined &&
        run.selectionReaders.size === 0
      ) {
        paused = true
        fenceEntered.resolve()
        await finishFence.promise
        return
      }
      return verify(run)
    }
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const load = gitStore.loadStatus.bind(gitStore)
    const failure = new Error('Synthetic final-drain reader failure')
    gitStore.loadStatus = async (...args) => {
      if (paused) {
        readerEntered.resolve()
        await finishReader.promise
        throw failure
      }
      return load(...args)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    let completed = false
    const operation = h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .then(outcome => {
        completed = true
        return outcome
      })
    await fenceEntered.promise
    const reader = h.appStore._loadStatus(repository).catch(error => error)
    await readerEntered.promise
    finishFence.resolve()
    await new Promise(resolve => setImmediate(resolve))
    const premature = completed
    finishReader.resolve()
    const outcome = await operation
    await reader
    assert.strictEqual(premature, false)
    assert.strictEqual(outcome.kind, 'error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(
      state.kind === 'error' &&
        assistedCommitErrorCauses(state.error).includes(failure)
    )
  })

  it('retains original SDK causes when the same reader error is invalidated repeatedly', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const original = new Error('Synthetic original SDK billing failure')
    h.propose.mock.mockImplementation(async () => {
      throw original
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const owned = h.appStore['assistedCommitRuns'].get(repository.id)
    assert.ok(owned)
    const reader = new Error('Synthetic repeated reader failure')
    h.appStore['invalidateAssistedCommitSelection'](repository, owned, reader)
    h.appStore['invalidateAssistedCommitSelection'](repository, owned, reader)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.ok(assistedCommitErrorCauses(state.error).includes(original))
    assert.ok(assistedCommitErrorCauses(state.error).includes(reader))
  })

  it('never interrupts an earlier native create-and-checkout with preparing admission', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['assistedCommitDisclaimerLastSeen'] = null
    h.appStore['uncommittedChangesStrategy'] =
      UncommittedChangesStrategy.MoveToNewBranch
    const gitStore = h.appStore['gitStoreCache'].get(repository)
    const create = gitStore.createBranch.bind(gitStore)
    const entered = deferred<void>()
    const finish = deferred<void>()
    gitStore.createBranch = async (...args) => {
      const result = await create(...args)
      entered.resolve()
      await finish.promise
      return result
    }
    const ordinary = h.appStore
      ._createBranch(repository, 'earlier-branch', 'HEAD')
      .then(
        result => ({ result }),
        error => ({ error })
      )
    await entered.promise
    const assisted = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await new Promise(resolve => setTimeout(resolve, 150))
    finish.resolve()
    const ordinaryOutcome = await ordinary
    h.cancel(repository)
    const assistedOutcome = await assisted
    assert.ok('result' in ordinaryOutcome)
    assert.strictEqual(
      await rawGit(repository, ['symbolic-ref', '--short', 'HEAD']),
      'earlier-branch'
    )
    assert.strictEqual(assistedOutcome.kind, 'busy')
    assert.strictEqual(h.propose.mock.callCount(), 0)
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

  it('completes mandatory settlement even when teardown error notification throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    let failed = false
    let threw = false
    h.appStore._refreshRepository = async repo => {
      if (h.state(repository).changesState.assistedCommit.kind === 'error') {
        failed = true
        throw new Error('Synthetic teardown failure')
      }
      return refresh(repo)
    }
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        failed &&
        !threw &&
        h.state(repository).changesState.assistedCommit.kind === 'error'
      ) {
        threw = true
        throw new Error('Synthetic teardown observer failure')
      }
    })
    t.after(() => subscription.dispose())
    h.propose.mock.mockImplementation(async () => {
      h.appStore['deferredAssistedCommitRefreshes'].set(
        repository.id,
        repository
      )
      throw new Error('Synthetic planner failure')
    })
    await h.dispatcher
      .createCopilotAssistedCommits(repository, h.request(repository))
      .catch(error => error)
    assert.strictEqual(h.state(repository).isCommitting, false)
    const run = h.appStore['assistedCommitRuns'].get(repository.id)
    assert.ok(run?.finished && run.lease === undefined)
    assert.strictEqual(await count(repository), 1)
  })

  it('keeps fresh status rows discovered during refresh-only restoration', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    const restore = h.appStore['restoreAssistedCommitSelection'].bind(
      h.appStore
    )
    h.appStore['restoreAssistedCommitSelection'] = async () => {
      throw new Error('Initial refresh failure')
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.cancel(repository)
      return wholeSelectionResponse(analysis)
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    h.appStore['restoreAssistedCommitSelection'] = restore
    const getDiff = h.appStore['getAssistedCommitRecoveryDiff'].bind(h.appStore)
    let injected = false
    h.appStore['getAssistedCommitRecoveryDiff'] = async (...args) => {
      const diff = await getDiff(...args)
      if (!injected) {
        injected = true
        await writeFile(join(repository.path, 'later'), 'new unselected row\n')
        await h.appStore._loadStatus(repository)
      }
      return diff
    }
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    assert.ok(
      h
        .state(repository)
        .changesState.workingDirectory.files.some(file => file.path === 'later')
    )
    assert.strictEqual(await count(repository), 1)
  })

  it('allows ordinary manual commits during a background fetch reservation when no assisted run exists', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setCommitMode(repository, 'manual')
    const refresh = h.appStore['_refreshRepositoryAfterCommit'].bind(h.appStore)
    let refreshed: Promise<void> | undefined
    h.appStore['_refreshRepositoryAfterCommit'] = (...args) => {
      refreshed = refresh(...args)
      return refreshed
    }
    const entered = deferred<void>()
    const finish = deferred<void>()
    const fetch = h.appStore['withPushPullFetch'](repository, async () => {
      entered.resolve()
      await finish.promise
    })
    await entered.promise
    let result: boolean | undefined
    let failure: unknown
    try {
      result = await h.appStore._commitIncludedChanges(repository, {
        summary: 'Ordinary manual commit',
        description: '',
        trailers: [],
      })
    } catch (error) {
      failure = error
    } finally {
      finish.resolve()
      await fetch
      await refreshed
    }
    assert.strictEqual(failure, undefined)
    assert.strictEqual(result, true)
    assert.strictEqual(await count(repository), 2)
  })

  it('retains original planner and billing causes after nonselection deferred refresh failure', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const original = new Error('Synthetic original SDK billing cause')
    const deferredFailure = new Error('Synthetic deferred remotes failure')
    const refresh = h.appStore._refreshRepository.bind(h.appStore)
    h.appStore._refreshRepository = async repo => {
      if (h.state(repository).changesState.assistedCommit.kind === 'error') {
        throw deferredFailure
      }
      return refresh(repo)
    }
    h.propose.mock.mockImplementation(async () => {
      h.appStore['deferredAssistedCommitRefreshes'].set(
        repository.id,
        repository
      )
      throw original
    })
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'error')
    assert.ok(assistedCommitErrorCauses(outcome.error).includes(original))
    assert.ok(
      assistedCommitErrorCauses(outcome.error).includes(deferredFailure)
    )
  })

  it('rejects a worktree move destination inside protected selected working files', async t => {
    const source = await seed(t, { file: 'before\n' })
    const other = await seed(t, { file: 'other\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(other)
    const lease = await acquireAssistedCommitGitLease(source.path)
    t.after(() => lease.release())
    let entered = false
    h.appStore['moveWorktreeCore'] = async () => {
      entered = true
    }
    await assert.rejects(
      h.appStore._moveWorktree(
        repository,
        other.path,
        join(source.path, 'new-destination')
      ),
      /assisted commit/i
    )
    assert.strictEqual(entered, false)
  })

  it('rejects creating a worktree inside protected selected working files before native add', async t => {
    const source = await seed(t, { file: 'before\n' })
    const other = await seed(t, { file: 'other\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(other)
    const lease = await acquireAssistedCommitGitLease(source.path)
    t.after(() => lease.release())
    await assert.rejects(
      h.appStore._addWorktreeAndSwitch(
        repository,
        join(source.path, 'new-destination'),
        { createBranch: 'must-not-exist' }
      ),
      /assisted commit/i
    )
    assert.strictEqual(
      await rawGit(repository, ['branch', '--list', 'must-not-exist']),
      ''
    )
  })

  it('keeps add/read/switch worktree covered by one admission lifetime', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    t.mock.method(h.appStore, '_selectRepository', async () => {})
    const target = join(await createTempDirectory(t), 'linked')
    const entered = deferred<void>()
    const finish = deferred<void>()
    const switchCore = h.appStore['switchWorktreeCore'].bind(h.appStore)
    h.appStore['switchWorktreeCore'] = async (...args) => {
      entered.resolve()
      await finish.promise
      return switchCore(...args)
    }
    const operation = h.appStore._addWorktreeAndSwitch(repository, target, {
      createBranch: 'whole-operation',
    })
    await entered.promise
    const assisted = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository, { allowEmptyCommit: true })
    )
    finish.resolve()
    await operation
    assert.strictEqual(assisted.kind, 'busy')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    const targetRepo = new Repository(target, -1, null, false)
    assert.strictEqual(
      await rawGit(targetRepo, ['symbolic-ref', '--short', 'HEAD']),
      'whole-operation'
    )
  })

  it('keeps the local identity pair covered until both real config writes finish', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const update = h.appStore['updateRepositoryCommitterValue'].bind(h.appStore)
    const entered = deferred<void>()
    const finish = deferred<void>()
    h.appStore['updateRepositoryCommitterValue'] = async (...args) => {
      await update(...args)
      if (args[1] === 'user.name') {
        entered.resolve()
        await finish.promise
      }
    }
    const operation = h.dispatcher.updateRepositoryCommitter(
      repository,
      'New local name',
      'new@example.invalid'
    )
    await entered.promise
    const assisted = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository, { allowEmptyCommit: true })
    )
    finish.resolve()
    await operation
    assert.strictEqual(assisted.kind, 'busy')
    assert.strictEqual(
      await rawGit(repository, ['config', '--local', '--get', 'user.name']),
      'New local name'
    )
    assert.strictEqual(
      await rawGit(repository, ['config', '--local', '--get', 'user.email']),
      'new@example.invalid'
    )
    assert.strictEqual(h.propose.mock.callCount(), 0)
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
    assert.ok(
      h.appStore['assistedCommitRestoredSelections'].has(selected.selection)
    )
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
    const certify = h.appStore['assertManualCommitSelectionAuthority'].bind(
      h.appStore
    )
    const changed = [...current]
    changed[25] = 'NEW unauthorized after certification\n'
    h.appStore['assertManualCommitSelectionAuthority'] = async (...args) => {
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

  for (const exit of ['cancel', 'decline'] as const) {
    it(`preserves multiple unchanged partial masks on pre-capture ${exit}, independently of displayed row`, async t => {
      const base = Array.from(
        { length: 60 },
        (_, index) => `line ${index + 1}\n`
      )
      const source = await seed(t, {
        a: base.join(''),
        b: base.join(''),
      })
      const current = [...base]
      current[3] = 'selected prefix\n'
      current[49] = 'unselected suffix\n'
      for (const path of ['a', 'b']) {
        await writeFile(join(source.path, path), current.join(''))
      }
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      for (const path of ['a', 'b']) {
        const toDisplay = h
          .request(repository)
          .files.find(file => file.path === path)
        assert.ok(toDisplay !== undefined)
        await h.dispatcher.selectWorkingDirectoryFiles(repository, [toDisplay])
        await h.appStore['updateChangesWorkingDirectoryDiff'](repository)
        const file = h
          .request(repository)
          .files.find(file => file.path === path)
        assert.ok(file !== undefined)
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
        await h.dispatcher.changeFileLineSelection(repository, file, selection)
      }
      const selected = h.request(repository)
      assert.strictEqual(selected.files.length, 2)
      h.appStore['assistedCommitDisclaimerLastSeen'] = null
      const shown = deferred<void>()
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          h.appStore['popupManager'].currentPopup?.type ===
          PopupType.AssistedCommitDisclaimer
        ) {
          shown.resolve()
        }
      })
      t.after(() => subscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        selected
      )
      await shown.promise
      if (exit === 'cancel') {
        h.cancel(repository)
      } else {
        const popup = h.appStore['popupManager'].currentPopup
        assert.ok(popup?.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      }
      const outcome = await operation
      assert.strictEqual(
        outcome.kind,
        exit === 'cancel' ? 'cancelled' : 'declined'
      )
      const retained = h.request(repository)
      assert.strictEqual(retained.files.length, 2)
      for (const file of selected.files) {
        assert.ok(
          retained.files
            .find(current => current.id === file.id)
            ?.selection.equals(file.selection)
        )
      }
      assert.strictEqual(h.propose.mock.callCount(), 0)
      assert.strictEqual(await count(repository), 1)
    })
  }

  it('resumes deferred native History reads under retained refresh protection', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const sha = await rawGit(repository, ['rev-parse', 'HEAD'])
    h.dispatcher.changeCommitSelection(repository, [sha], true)
    h.appStore['deferredAssistedCommitHistorySelections'].set(
      repository.id,
      repository
    )
    const protection = protectAssistedCommitResources(repository.path)
    t.after(() => protection.release())
    const load = t.mock.method(
      h.appStore,
      '_loadChangedFilesForCurrentSelection',
      h.appStore._loadChangedFilesForCurrentSelection.bind(h.appStore)
    )
    await h.appStore['resumeDeferredAssistedCommitHistory'](repository)
    assert.strictEqual(load.mock.callCount(), 1)
    assert.strictEqual(
      h.state(repository).commitSelection.changesetData.files.length,
      1
    )
    assert.strictEqual(
      h.appStore['deferredAssistedCommitHistorySelections'].has(repository.id),
      false
    )
  })

  it('retains a deferred History request until native visualization succeeds', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.appStore['deferredAssistedCommitHistorySelections'].set(
      repository.id,
      repository
    )
    t.mock.method(
      h.appStore,
      '_loadChangedFilesForCurrentSelection',
      async () => {
        throw new Error('Synthetic History read failure')
      }
    )
    await h.appStore['resumeDeferredAssistedCommitHistory'](repository)
    assert.strictEqual(
      h.appStore['deferredAssistedCommitHistorySelections'].has(repository.id),
      true
    )
  })

  it('does not recursively resume an already-admitted deferred History read', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const sha = await rawGit(repository, ['rev-parse', 'HEAD'])
    h.dispatcher.changeCommitSelection(repository, [sha], true)
    h.appStore['deferredAssistedCommitHistorySelections'].set(
      repository.id,
      repository
    )
    const original = h.appStore._loadChangedFilesForCurrentSelection.bind(
      h.appStore
    )
    let loaded = 0
    h.appStore._loadChangedFilesForCurrentSelection = async repo => {
      loaded++
      if (loaded === 1) {
        await h.appStore['resumeDeferredAssistedCommitHistory'](repo)
      }
      return original(repo)
    }
    await h.appStore['resumeDeferredAssistedCommitHistory'](repository)
    assert.strictEqual(loaded, 1)
  })

  it('defers optional History without waiting behind an unfinished owner lacking a result', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const entered = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    h.appStore['deferredAssistedCommitHistorySelections'].set(
      repository.id,
      repository
    )
    let resumed = false
    const history = h.appStore['resumeDeferredAssistedCommitHistory'](
      repository
    ).then(() => {
      resumed = true
    })
    try {
      await new Promise(resolve => setImmediate(resolve))
      assert.strictEqual(resumed, true)
    } finally {
      h.cancel(repository)
      finish.resolve()
      await operation
      await history
    }
    assert.strictEqual(await count(repository), 1)
  })

  it('keeps accepted outcome and statistics when deferred History error delivery throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const nativeFailure = new Error('Synthetic deferred History failure')
    const notificationFailure = new Error('Synthetic History error observer')
    t.mock.method(
      h.appStore,
      '_loadChangedFilesForCurrentSelection',
      async () => {
        throw nativeFailure
      }
    )
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.appStore['deferredAssistedCommitHistorySelections'].set(
        repository.id,
        repository
      )
      return wholeSelectionResponse(analysis)
    })
    const subscription = h.appStore.onDidError(() => {
      throw notificationFailure
    })
    t.after(() => subscription.dispose())
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.strictEqual(outcome.kind, 'local-ready')
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('reserves parent-overlapping physical bytes before the first preparing publication', async t => {
    const parentSource = await seed(t, { parent: 'parent\n' })
    const childSource = await seed(t, { file: 'before\n' })
    const childPath = join(parentSource.path, 'nested')
    await rename(childSource.path, childPath)
    await mkdir(childSource.path)
    await writeFile(join(childPath, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const child = await h.register(new Repository(childPath, -1, null, false))
    const parent = await h.register(parentSource)
    const entered = deferred<void>()
    const finish = deferred<void>()
    let observed = false
    let protectedAtPublication = false
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        !observed &&
        h.state(child).changesState.assistedCommit.kind === 'preparing'
      ) {
        observed = true
        protectedAtPublication = isRepositoryAffectedByAssistedCommit(
          parent.path
        )
      }
    })
    t.after(() => subscription.dispose())
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      child,
      h.request(child)
    )
    await entered.promise
    h.cancel(child)
    finish.resolve()
    await operation
    assert.strictEqual(protectedAtPublication, true)
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

  it('does not let obsolete GitStore emissions replace a transferred native tip', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const a = await h.register(source)
    const oldStore = h.appStore['gitStoreCache'].get(a)
    const b = new Repository(
      a.path,
      a.id,
      null,
      false,
      'Updated alias',
      {},
      false,
      a.gitDir
    )
    h.stores.repositoryStateCache.transferState(a, b)
    await rawGit(b, ['commit', '--allow-empty', '-m', 'New native tip'])
    await h.appStore._loadStatus(b)
    const currentTip = h.state(b).branchesState.tip
    oldStore['emitUpdate']()
    assert.deepStrictEqual(h.state(b).branchesState.tip, currentTip)
    assert.deepStrictEqual(h.state(a).branchesState.tip, currentTip)
  })

  it('rejects old-path native emissions after the same worktree moves', async t => {
    const source = await seed(t, { file: 'before\n' })
    const h = await createAssistedCommitRunHarness(t)
    const old = await h.register(source)
    const oldStore = h.appStore['gitStoreCache'].get(old)
    const path = join(await createTempDirectory(t), 'moved')
    await rename(source.path, path)
    await mkdir(source.path)
    const moved = new Repository(
      path,
      old.id,
      null,
      false,
      null,
      {},
      false,
      join(path, '.git')
    )
    h.stores.repositoryStateCache.transferState(old, moved)
    await rawGit(moved, ['commit', '--allow-empty', '-m', 'New moved tip'])
    await h.appStore._loadStatus(moved)
    const current = h.state(moved)
    oldStore['emitUpdate']()
    assert.deepStrictEqual(
      h.state(moved).branchesState.tip,
      current.branchesState.tip
    )
    assert.deepStrictEqual(
      h.state(moved).localCommitSHAs,
      current.localCommitSHAs
    )
    assert.notDeepStrictEqual(
      h.state(old).branchesState.tip,
      current.branchesState.tip
    )
    assert.strictEqual(await count(moved), 2)
  })

  it('rejects native clone checkout into protected selected working files', async t => {
    const source = await seed(t, { file: 'Clone replacement\n' })
    const target = await seed(t, { 'nested/file': 'Selected deletion\n' })
    await unlink(join(target.path, 'nested/file'))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(target)
    const entered = deferred<void>()
    const finish = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      entered.resolve()
      await finish.promise
      return wholeSelectionResponse(analysis)
    })
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await entered.promise
    try {
      await assert.rejects(
        clone(source.path, join(repository.path, 'nested'), {
          defaultBranch: 'main',
        }),
        /assisted commit run/
      )
    } finally {
      h.cancel(repository)
      finish.resolve()
      await operation
    }
    assert.strictEqual(
      await optionalBytes(join(repository.path, 'nested/file')),
      null
    )
    assert.strictEqual(await count(repository), 1)
  })

  it('reserves clone destinations before native checkout for reciprocal assisted admission', async t => {
    const source = await seed(t, { file: 'Clone replacement\n' })
    const target = await seed(t, { 'nested/file': 'Selected deletion\n' })
    await unlink(join(target.path, 'nested/file'))
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(target)
    let attempted:
      | ReturnType<typeof h.dispatcher.createCopilotAssistedCommits>
      | undefined
    await clone(
      source.path,
      join(repository.path, 'nested'),
      { defaultBranch: 'main' },
      progress => {
        if (progress.value === 0 && attempted === undefined) {
          attempted = h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
        }
      }
    )
    assert.ok(attempted !== undefined)
    assert.strictEqual((await attempted).kind, 'busy')
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(await count(repository), 1)
  })

  it('keeps settled manual diff failures outside old assisted refresh recovery', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.propose.mock.mockImplementation(async () => {
      throw new Error('Settled planner error')
    })
    await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    h.dispatcher.setCommitMode(repository, 'manual')
    h.appStore['updateChangesWorkingDirectoryDiffCore'] = async () => {
      throw new Error('Ordinary manual diff failure')
    }
    await h.appStore['updateChangesWorkingDirectoryDiff'](repository).catch(
      error => error
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === null)
    assert.strictEqual(h.state(repository).changesState.commitMode, 'manual')
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

  for (const notification of ['accepted', 'settled'] as const) {
    it(`preserves local-ready outcome and accepted statistics when ${notification} notification throws`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      let threw = false
      const subscription = h.appStore.onDidUpdate(() => {
        const state = h.state(repository)
        const run = h.appStore['assistedCommitRuns'].get(repository.id)
        if (
          !threw &&
          state.changesState.assistedCommit.kind === 'idle' &&
          (notification === 'accepted' ? run?.finalized : !state.isCommitting)
        ) {
          threw = true
          throw new Error('Synthetic post-accept observer failure')
        }
      })
      t.after(() => subscription.dispose())
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.strictEqual(outcome.kind, 'local-ready')
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(await count(repository), 2)
      assert.strictEqual(h.state(repository).isCommitting, false)
    })
  }

  for (const exit of ['cancel', 'decline', 'error'] as const) {
    for (const notification of ['update', 'history'] as const) {
      it(`returns controlled ${exit} after final ${notification} notification throws`, async t => {
        const source = await seed(t, { file: 'before\n' })
        await writeFile(join(source.path, 'file'), 'selected\n')
        const h = await createAssistedCommitRunHarness(t)
        const repository = await h.register(source)
        const originalFailure = new Error('Synthetic planner failure')
        const notificationFailure = new Error(
          'Synthetic settled notification failure'
        )
        const deferHistory = () => {
          if (notification === 'history') {
            h.appStore['deferredAssistedCommitHistorySelections'].set(
              repository.id,
              repository
            )
          }
        }
        if (notification === 'history') {
          let settledReaders = false
          const load = h.appStore._loadChangedFilesForCurrentSelection.bind(
            h.appStore
          )
          t.mock.method(
            h.appStore,
            '_loadChangedFilesForCurrentSelection',
            async (repo: Repository) => {
              if (settledReaders) {
                throw new Error('Synthetic settled History failure')
              }
              return load(repo)
            }
          )
          const finish = h.appStore['finishAssistedCommitSelectionReads'].bind(
            h.appStore
          )
          h.appStore['finishAssistedCommitSelectionReads'] = async run => {
            await finish(run)
            settledReaders = true
            deferHistory()
          }
        }
        if (exit === 'decline') {
          h.appStore['assistedCommitDisclaimerLastSeen'] = null
        }
        h.propose.mock.mockImplementation(async (_account, analysis) => {
          if (exit === 'error') {
            throw originalFailure
          }
          h.cancel(repository)
          return wholeSelectionResponse(analysis)
        })
        let threw = false
        const subscription =
          notification === 'history'
            ? h.appStore.onDidError(() => {
                threw = true
                throw notificationFailure
              })
            : h.appStore.onDidUpdate(() => {
                const state = h.state(repository)
                const run = h.appStore['assistedCommitRuns'].get(repository.id)
                if (
                  !threw &&
                  !state.isCommitting &&
                  (run === undefined || run.finished)
                ) {
                  threw = true
                  throw notificationFailure
                }
              })
        t.after(() => subscription.dispose())
        const shown = deferred<void>()
        const popupSubscription = h.appStore.onDidUpdate(() => {
          if (
            h.appStore['popupManager'].currentPopup?.type ===
            PopupType.AssistedCommitDisclaimer
          ) {
            shown.resolve()
          }
        })
        t.after(() => popupSubscription.dispose())
        const operation = h.dispatcher.createCopilotAssistedCommits(
          repository,
          h.request(repository)
        )
        if (exit === 'decline') {
          await shown.promise
          const popup = h.appStore['popupManager'].currentPopup
          assert.ok(popup?.id !== undefined)
          h.dispatcher.closePopupById(popup.id)
        }
        const outcome = await operation
        assert.strictEqual(threw, true)
        assert.strictEqual(
          outcome.kind,
          exit === 'cancel'
            ? 'cancelled'
            : exit === 'decline'
            ? 'declined'
            : 'error'
        )
        if (outcome.kind === 'error') {
          const causes = assistedCommitErrorCauses(outcome.error)
          assert.ok(causes.includes(originalFailure))
          assert.ok(causes.includes(notificationFailure))
        } else {
          assert.strictEqual(
            h.appStore['assistedCommitRuns'].has(repository.id),
            false
          )
        }
        assert.strictEqual(await count(repository), 1)
        assert.strictEqual(h.commits.mock.callCount(), 0)
        assert.strictEqual(h.state(repository).isCommitting, false)
      })
    }
  }

  for (const exit of ['cancel', 'decline'] as const) {
    it(`keeps ${exit} controlled when the first idle notification throws before native settlement`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      if (exit === 'decline') {
        h.appStore['assistedCommitDisclaimerLastSeen'] = null
      }
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        h.cancel(repository)
        return wholeSelectionResponse(analysis)
      })
      let threw = false
      const subscription = h.appStore.onDidUpdate(() => {
        if (
          !threw &&
          h.state(repository).changesState.assistedCommit.kind === 'idle'
        ) {
          threw = true
          throw new Error('Synthetic first idle notification failure')
        }
      })
      t.after(() => subscription.dispose())
      const shown = deferred<void>()
      const popupSubscription = h.appStore.onDidUpdate(() => {
        if (
          h.appStore['popupManager'].currentPopup?.type ===
          PopupType.AssistedCommitDisclaimer
        ) {
          shown.resolve()
        }
      })
      t.after(() => popupSubscription.dispose())
      const operation = h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      if (exit === 'decline') {
        await shown.promise
        const popup = h.appStore['popupManager'].currentPopup
        assert.ok(popup?.id !== undefined)
        h.dispatcher.closePopupById(popup.id)
      }
      const outcome = await operation
      assert.strictEqual(threw, true)
      assert.strictEqual(
        outcome.kind,
        exit === 'cancel' ? 'cancelled' : 'declined'
      )
      assert.strictEqual(h.state(repository).isCommitting, false)
      assert.strictEqual(
        h.appStore['assistedCommitRuns'].has(repository.id),
        false
      )
      assert.strictEqual(await count(repository), 1)
      assert.strictEqual(h.commits.mock.callCount(), 0)
    })
  }

  it('keeps newly observed changes excluded through a sealed status continuation, without leaking policy to later reads', async t => {
    const source = await seed(t, { selected: 'before\n' })
    await writeFile(join(source.path, 'selected'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const sealed = deferred<void>()
    const finish = deferred<void>()
    const settle = h.appStore['finishAssistedCommitSelectionReads'].bind(
      h.appStore
    )
    let paused = false
    h.appStore['finishAssistedCommitSelectionReads'] = async run => {
      await settle(run)
      if (!paused && run.finalized) {
        paused = true
        sealed.resolve()
        await finish.promise
      }
    }
    const operation = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await sealed.promise
    const status = h.appStore._loadStatus(repository)
    await writeFile(join(repository.path, 'introduced'), 'UNSELECTED\n')
    finish.resolve()
    assert.strictEqual((await operation).kind, 'local-ready')
    await status
    const introduced = h
      .state(repository)
      .changesState.workingDirectory.files.find(
        file => file.path === 'introduced'
      )
    assert.ok(introduced !== undefined)
    assert.strictEqual(
      introduced.selection.getSelectionType(),
      DiffSelectionType.None
    )
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].has(repository.id),
      false
    )
    await writeFile(join(repository.path, 'later'), 'ordinary later edit\n')
    await h.appStore._loadStatus(repository)
    const later = h
      .state(repository)
      .changesState.workingDirectory.files.find(file => file.path === 'later')
    assert.ok(later !== undefined)
    assert.strictEqual(
      later.selection.getSelectionType(),
      DiffSelectionType.All
    )
    assert.strictEqual(await count(repository), 2)
  })

  it('does not let a sealed status request clear a replacement run selected after its read begins', async t => {
    const { h, repository } = await partialSelectionFixture(t)
    const sealed = deferred<void>()
    const finish = deferred<void>()
    const settle = h.appStore['finishAssistedCommitSelectionReads'].bind(
      h.appStore
    )
    let paused = false
    h.appStore['finishAssistedCommitSelectionReads'] = async run => {
      await settle(run)
      if (!paused && run.finalized) {
        paused = true
        sealed.resolve()
        await finish.promise
      }
    }
    const first = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await sealed.promise
    const installing = deferred<void>()
    const install = deferred<void>()
    let held = false
    h.runtime.mock.mockImplementation(async () => {
      if (!held) {
        held = true
        installing.resolve()
        await install.promise
      }
      return true
    })
    const status = h.appStore._loadStatus(repository, true)
    finish.resolve()
    assert.strictEqual((await first).kind, 'local-ready')
    await installing.promise
    const file = h.state(repository).changesState.workingDirectory.files[0]
    const diff = await getWorkingDirectoryDiff(repository, file)
    assert.ok(diff.kind === DiffType.Text)
    const hunk = diff.hunks[0]
    const index = hunk.lines.findIndex(line => line.isIncludeableLine())
    assert.ok(index >= 0)
    const selection = file.selection.withLineSelection(
      hunk.unifiedDiffStart + index,
      true
    )
    assert.strictEqual(selection.getSelectionType(), DiffSelectionType.Partial)
    await h.dispatcher.changeFileLineSelection(repository, file, selection)
    const planning = deferred<void>()
    const plan = deferred<void>()
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      planning.resolve()
      await plan.promise
      return wholeSelectionResponse(analysis)
    })
    const preparing = deferred<void>()
    const subscription = h.appStore.onDidUpdate(() => {
      if (
        h.state(repository).changesState.assistedCommit.kind === 'preparing'
      ) {
        preparing.resolve()
      }
    })
    t.after(() => subscription.dispose())
    const replacement = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    const started = await Promise.race([
      preparing.promise.then(() => true),
      replacement.then(() => false),
    ])
    install.resolve()
    try {
      await status
      const phase = await Promise.race([
        planning.promise.then(() => 'planning'),
        replacement.then(outcome => outcome.kind),
      ])
      assert.strictEqual(started, true)
      assert.strictEqual(phase, 'planning')
      assert.strictEqual(
        h
          .state(repository)
          .changesState.workingDirectory.files[0].selection.getSelectionType(),
        DiffSelectionType.Partial
      )
    } finally {
      plan.resolve()
      await replacement
    }
    assert.strictEqual(await count(repository), 3)
  })
})
