import assert from 'node:assert/strict'
import { TestContext, describe, it } from 'node:test'
import { promises as FileSystem } from 'fs'
import ChildProcess from 'child_process'
import * as React from 'react'
import { basename, join } from 'path'
import {
  AssistedCommitError,
  IAssistedCommitCleanupToken,
} from '../../../src/lib/git/assisted-commit'
import {
  assistedCommitErrorCauses,
  getAssistedCommitCleanupToken,
} from '../../../src/lib/assisted-commit-run'
import { CopilotError } from '../../../src/lib/copilot-error'
import { ErrorWithMetadata } from '../../../src/lib/error-with-metadata'
import {
  isReadOnlyGitCommand,
  isRepositoryAffectedByAssistedCommit,
  isRepositoryGitPaused,
} from '../../../src/lib/git/repository-operation'
import { CopilotCommitPanel } from '../../../src/ui/changes/copilot-commit-panel'
import { DiffSelectionType, DiffType } from '../../../src/models/diff'
import { getWorkingDirectoryDiff } from '../../../src/lib/git/diff'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import {
  count,
  createPathMatcher,
  indexPath,
  optionalBytes,
  rawGit,
  seed,
  tip,
} from '../../helpers/assisted-commit'
import { splitResponse } from '../../helpers/copilot-assisted-commit'
import { fireEvent, render, screen, waitFor } from '../../helpers/ui/render'

async function fixture(t: TestContext) {
  const source = await seed(t, { selected: 'before\n', other: 'other\n' })
  await FileSystem.writeFile(join(source.path, 'selected'), 'selected\n')
  const h = await createAssistedCommitRunHarness(t)
  const repository = await h.register(source)
  const originalHead = await tip(repository)
  const index = await indexPath(repository)
  const originalIndex = await optionalBytes(index)
  const remove = FileSystem.rm
  const makeDirectory = FileSystem.mkdtemp
  const write = FileSystem.writeFile
  const captureError = new Error('Injected snapshot configuration EIO')
  const removalError = new Error('Injected owned snapshot removal EIO')
  const state: {
    directory: string
    failCapture: boolean
    captureError: unknown
    failCleanup: boolean
    attempts: number
    onCreated?: () => void
    beforeRemove?: () => void | Promise<void>
  } = {
    directory: '',
    failCapture: false,
    captureError,
    failCleanup: true,
    attempts: 0,
  }
  const directories = new Set<string>()
  let matchesDirectory: ((value: unknown) => Promise<boolean>) | undefined
  let matchesConfiguration: ((value: unknown) => Promise<boolean>) | undefined
  t.after(async () => {
    const run = h.appStore['assistedCommitRuns'].get(repository.id)
    run?.lease?.release()
    run?.resourceProtection?.release()
    for (const directory of directories) {
      await remove(directory, { recursive: true, force: true })
    }
  })
  t.mock.method(
    FileSystem,
    'mkdtemp',
    async (...args: Parameters<typeof FileSystem.mkdtemp>) => {
      const directory = await makeDirectory(...args)
      if (basename(directory).startsWith('desktop-assisted-commit-')) {
        directories.add(directory)
        state.directory = directory
        matchesDirectory = await createPathMatcher(directory)
        matchesConfiguration = await createPathMatcher(
          join(directory, 'config')
        )
        state.onCreated?.()
      }
      return directory
    }
  )
  t.mock.method(
    FileSystem,
    'writeFile',
    async (...args: Parameters<typeof FileSystem.writeFile>) => {
      if (state.failCapture && (await matchesConfiguration?.(args[0]))) {
        throw state.captureError
      }
      return write(...args)
    }
  )
  t.mock.method(
    FileSystem,
    'rm',
    async (...args: Parameters<typeof FileSystem.rm>) => {
      if (await matchesDirectory?.(args[0])) {
        state.attempts++
        await state.beforeRemove?.()
        if (state.failCleanup) {
          throw removalError
        }
      }
      return remove(...args)
    }
  )
  const currentRun = () => {
    const run = h.appStore['assistedCommitRuns'].get(repository.id)
    assert.ok(run)
    return run
  }
  const failure = () => {
    const state = h.state(repository).changesState.assistedCommit
    assert.equal(state.kind, 'error')
    if (state.kind !== 'error') {
      throw new Error('Expected retained cleanup error')
    }
    return state
  }
  const token = (): IAssistedCommitCleanupToken => {
    const cleanup = assistedCommitErrorCauses(failure().error).find(
      (error): error is AssistedCommitError =>
        error instanceof AssistedCommitError && error.cleanupToken !== undefined
    )?.cleanupToken
    assert.ok(cleanup)
    return cleanup
  }
  const unchanged = async () => {
    assert.equal(await tip(repository), originalHead)
    assert.equal(await count(repository), 1)
    assert.deepEqual(await optionalBytes(index), originalIndex)
    assert.equal(
      await FileSystem.readFile(join(repository.path, 'selected'), 'utf8'),
      'selected\n'
    )
  }
  return {
    ...h,
    repository,
    originalHead,
    index,
    originalIndex,
    faults: state,
    removalError,
    captureError,
    currentRun,
    failure,
    token,
    unchanged,
  }
}

describe('AppStore owned temporary cleanup retry', () => {
  it('retains a pre-callback cleanup capability, retries the same owned directory and drains waiting readers', async t => {
    const h = await fixture(t)
    h.faults.failCapture = true
    const result = await h.dispatcher.createCopilotAssistedCommits(
      h.repository,
      h.request(h.repository)
    )
    assert.equal(result.kind, 'error')
    const run = h.currentRun()
    assert.equal(run.snapshot, undefined)
    assert.equal(run.cleanupPending, true)
    assert.equal(h.failure().retry, 'recovery')
    assert.equal(h.failure().settling, false)
    assert.ok(
      h.faults.attempts > 0,
      'The exact owned-directory removal fault must fire'
    )
    const token = h.token()
    assert.equal(
      getAssistedCommitCleanupToken(
        new AggregateError([new ErrorWithMetadata(h.failure().error, {})])
      ),
      token
    )
    assert.equal(run.cleanupToken, token)
    assert.ok(
      assistedCommitErrorCauses(h.failure().error).includes(h.captureError)
    )
    assert.ok(
      assistedCommitErrorCauses(h.failure().error).includes(h.removalError)
    )
    h.dispatcher.dismissCopilotAssistedCommitError(h.repository, run.id)
    assert.equal(h.failure().retry, 'recovery')
    assert.equal(
      (
        await h.dispatcher.createCopilotAssistedCommits(
          h.repository,
          h.request(h.repository)
        )
      ).kind,
      'busy'
    )
    const reader = h.appStore._loadStatus(h.repository)
    const native = t.mock.method(ChildProcess, 'spawn')
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.equal(
      native.mock.callCount(),
      0,
      'Failed temporary-only retry must not invoke Git'
    )
    assert.equal(run.cleanupToken, token)
    assert.equal(h.token(), token)
    assert.equal(run.cleanupPending, true)
    assert.equal(h.failure().retry, 'recovery')
    assert.equal(h.failure().settling, false)
    const attempts = h.faults.attempts
    h.faults.failCleanup = false
    h.faults.beforeRemove = () => {
      assert.equal(
        native.mock.callCount(),
        0,
        'Cleanup must precede repository reconciliation'
      )
    }
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    await reader
    assert.ok(h.faults.attempts > attempts)
    assert.ok(
      native.mock.calls.every(
        call =>
          Array.isArray(call.arguments[1]) &&
          isReadOnlyGitCommand(call.arguments[1])
      ),
      'Post-cleanup reconciliation must be read-only'
    )
    assert.equal(run.cleanupPending, false)
    assert.equal(run.cleanupToken, undefined)
    assert.equal(run.lease, undefined)
    assert.equal(run.resourceProtection, undefined)
    assert.equal(
      h.appStore['assistedCommitSelectionReaders'].has(h.repository.id),
      false
    )
    assert.equal(isRepositoryGitPaused(h.repository.path), false)
    assert.equal(isRepositoryAffectedByAssistedCommit(h.repository.path), false)
    assert.equal(h.state(h.repository).changesState.assistedCommit.kind, 'idle')
    assert.equal(
      h
        .state(h.repository)
        .changesState.workingDirectory.files[0].selection.getSelectionType(),
      DiffSelectionType.All
    )
    assert.equal(h.propose.mock.callCount(), 0)
    assert.equal(h.commits.mock.callCount(), 0)
    await assert.rejects(FileSystem.lstat(h.faults.directory), {
      code: 'ENOENT',
    })
    await h.unchanged()
  })

  for (const operation of [
    'planner',
    'validation',
    'cancelled',
    'billing',
    'non-error',
  ] as const) {
    it(`retains the original ${operation} failure and wires the existing panel Retry action to temporary cleanup`, async t => {
      const h = await fixture(t)
      const original =
        operation === 'cancelled'
          ? new AssistedCommitError(
              'cancelled',
              'Injected planning cancellation'
            )
          : operation === 'billing'
          ? new CopilotError('Injected billing failure', 402, {
              paymentRequiredErrorCode: 'quota_exceeded',
            })
          : operation === 'non-error'
          ? undefined
          : new Error('Injected planner failure')
      h.propose.mock.mockImplementation(async (_account, analysis) => {
        if (operation === 'validation') {
          return { kind: 'plan', snapshotId: analysis.snapshotId, commits: [] }
        }
        throw original
      })
      const result = await h.dispatcher.createCopilotAssistedCommits(
        h.repository,
        h.request(h.repository)
      )
      assert.equal(result.kind, 'error')
      const run = h.currentRun()
      assert.ok(run.snapshot)
      assert.equal(run.cleanupPending, true)
      assert.equal(h.failure().retry, 'recovery')
      assert.ok(h.faults.attempts > 0)
      const token = h.token()
      assert.equal(run.cleanupToken, token)
      if (operation !== 'validation') {
        assert.ok(
          assistedCommitErrorCauses(h.failure().error).includes(original)
        )
      } else {
        assert.ok(
          assistedCommitErrorCauses(h.failure().error).some(
            error =>
              error instanceof Error && /plan|commit/i.test(error.message)
          )
        )
      }
      let retry: Promise<void> | undefined
      render(
        <CopilotCommitPanel
          filesSelectedCount={1}
          isWorking={false}
          runState={h.failure()}
          onRetryRecovery={() => {
            retry = h.dispatcher.retryCopilotAssistedCommitRecovery(
              h.repository,
              run.id
            )
          }}
          onDismissError={() =>
            h.dispatcher.dismissCopilotAssistedCommitError(h.repository, run.id)
          }
        />
      )
      assert.equal(screen.queryByRole('button', { name: 'Dismiss' }), null)
      h.faults.failCleanup = false
      fireEvent.click(screen.getByRole('button', { name: 'Retry rollback' }))
      await waitFor(() => assert.ok(retry))
      await retry
      assert.equal(run.cleanupPending, false)
      assert.equal(run.cleanupToken, undefined)
      assert.equal(
        h.state(h.repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.equal(h.propose.mock.callCount(), 1)
      assert.equal(h.commits.mock.callCount(), 0)
      await h.unchanged()
    })
  }

  for (const captured of [false, true]) {
    it(`cleans only owned temporary files after current HEAD/index/working bytes change (captured=${captured})`, async t => {
      const h = await fixture(t)
      h.faults.failCapture = !captured
      h.propose.mock.mockImplementation(async () => {
        throw h.captureError
      })
      await h.dispatcher.createCopilotAssistedCommits(
        h.repository,
        h.request(h.repository)
      )
      const run = h.currentRun()
      assert.equal(h.failure().retry, 'recovery')
      const token = h.token()
      await rawGit(h.repository, ['branch', 'external', 'HEAD'])
      const tree = await rawGit(h.repository, ['rev-parse', 'HEAD^{tree}'])
      const externalHead = await rawGit(
        h.repository,
        ['commit-tree', tree, '-p', h.originalHead],
        { stdin: 'External commit\n' }
      )
      await rawGit(h.repository, [
        'update-ref',
        'refs/heads/external',
        externalHead,
      ])
      await rawGit(h.repository, [
        'symbolic-ref',
        'HEAD',
        'refs/heads/external',
      ])
      await FileSystem.writeFile(
        join(h.repository.path, 'other'),
        'external staging\n'
      )
      await rawGit(h.repository, ['add', '--', 'other'])
      await FileSystem.writeFile(
        join(h.repository.path, 'selected'),
        'CURRENT unrelated edit\n'
      )
      const currentIndex = await optionalBytes(h.index)
      const native = t.mock.method(ChildProcess, 'spawn')
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        h.repository,
        run.id
      )
      assert.equal(native.mock.callCount(), 0)
      assert.equal(run.cleanupToken, token)
      assert.equal(h.failure().retry, 'recovery')
      h.faults.failCleanup = false
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        h.repository,
        run.id
      )
      assert.equal(run.cleanupPending, false)
      assert.equal(run.cleanupToken, undefined)
      assert.equal(run.lease, undefined)
      assert.equal(h.failure().retry, null)
      assert.equal(h.failure().selectionNeedsReview, true)
      assert.ok(
        h
          .state(h.repository)
          .changesState.workingDirectory.files.every(
            file => file.selection.getSelectionType() === DiffSelectionType.None
          )
      )
      assert.equal(h.propose.mock.callCount(), captured ? 1 : 0)
      assert.equal(
        await rawGit(h.repository, ['symbolic-ref', 'HEAD']),
        'refs/heads/external'
      )
      assert.equal(await tip(h.repository), externalHead)
      assert.deepEqual(await optionalBytes(h.index), currentIndex)
      assert.equal(
        await FileSystem.readFile(join(h.repository.path, 'selected'), 'utf8'),
        'CURRENT unrelated edit\n'
      )
      assert.equal(
        await FileSystem.readFile(join(h.repository.path, 'other'), 'utf8'),
        'external staging\n'
      )
      assert.ok(
        native.mock.calls.every(
          call =>
            Array.isArray(call.arguments[1]) &&
            isReadOnlyGitCommand(call.arguments[1])
        )
      )
      assert.equal(h.commits.mock.callCount(), 0)
      await assert.rejects(FileSystem.lstat(h.faults.directory), {
        code: 'ENOENT',
      })
    })
  }

  it('keeps capture cancellation visible until its pre-snapshot cleanup succeeds', async t => {
    const h = await fixture(t)
    h.faults.onCreated = () => h.cancel(h.repository)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      h.repository,
      h.request(h.repository)
    )
    assert.equal(
      outcome.kind,
      'error',
      'Cancellation must not swallow an owned cleanup failure'
    )
    const run = h.currentRun()
    assert.equal(run.snapshot, undefined)
    assert.equal(run.cleanupPending, true)
    assert.equal(h.failure().retry, 'recovery')
    assert.ok(
      assistedCommitErrorCauses(h.failure().error).some(
        error =>
          error instanceof AssistedCommitError && error.code === 'cancelled'
      )
    )
    assert.ok(h.faults.attempts > 0)
    h.faults.failCleanup = false
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.equal(h.state(h.repository).changesState.assistedCommit.kind, 'idle')
    assert.equal(run.cleanupPending, false)
    assert.equal(h.propose.mock.callCount(), 0)
    await h.unchanged()
  })

  it('preserves a certified partial selection after cleanup of a failed pre-callback capture', async t => {
    const h = await fixture(t)
    const file = h.request(h.repository).files[0]
    const diff = await getWorkingDirectoryDiff(h.repository, file)
    assert.ok(diff.kind === DiffType.Text)
    const hunk = diff.hunks[0]
    const index = hunk.lines.findIndex(line => line.isIncludeableLine())
    const selection = file.selection.withLineSelection(
      hunk.unifiedDiffStart + index,
      false
    )
    assert.equal(selection.getSelectionType(), DiffSelectionType.Partial)
    await h.dispatcher.changeFileLineSelection(h.repository, file, selection)
    h.faults.failCapture = true
    await h.dispatcher.createCopilotAssistedCommits(
      h.repository,
      h.request(h.repository)
    )
    const run = h.currentRun()
    assert.equal(run.snapshot, undefined)
    assert.equal(h.failure().retry, 'recovery')
    h.faults.failCleanup = false
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.equal(h.state(h.repository).changesState.assistedCommit.kind, 'idle')
    assert.ok(
      h
        .state(h.repository)
        .changesState.workingDirectory.files[0].selection.equals(selection)
    )
    await h.unchanged()
  })

  it('keeps exact full recovery ahead of a simultaneous cleanup-only capability through failed rollback retries', async t => {
    const h = await fixture(t)
    await FileSystem.writeFile(
      join(h.repository.path, 'other'),
      'selected other\n'
    )
    await h.appStore._loadStatus(h.repository)
    h.propose.mock.mockImplementation(async (_account, analysis) =>
      splitResponse(analysis)
    )
    let runTip: string | undefined
    let externalTip: string | undefined
    const onProgress = h.appStore['onAssistedCommitProgress'].bind(h.appStore)
    h.appStore['onAssistedCommitProgress'] = async (run, progress) => {
      onProgress(run, progress)
      if (progress.kind === 'committing' && progress.index === 1) {
        runTip = await tip(h.repository)
        const tree = await rawGit(h.repository, [
          'rev-parse',
          `${h.originalHead}^{tree}`,
        ])
        externalTip = await rawGit(
          h.repository,
          ['commit-tree', tree, '-p', runTip],
          { stdin: 'External history\n' }
        )
        await rawGit(h.repository, [
          'update-ref',
          'refs/heads/external',
          externalTip,
        ])
        await rawGit(h.repository, ['update-ref', 'HEAD', externalTip, runTip])
      }
    }
    await h.dispatcher.createCopilotAssistedCommits(
      h.repository,
      h.request(h.repository)
    )
    const run = h.currentRun()
    const full = h.failure().recovery?.retryToken
    const cleanup = h.token()
    assert.ok(full && runTip && externalTip)
    assert.strictEqual(run.recoveryCapability, full)
    assert.strictEqual(run.cleanupToken, cleanup)
    assert.ok(
      h.faults.attempts >= 2,
      'Executor and preferred-scope cleanup faults must both fire'
    )
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.strictEqual(run.recoveryCapability, full)
    assert.strictEqual(run.cleanupToken, cleanup)
    assert.strictEqual(h.failure().recovery?.retryToken, full)
    h.faults.failCleanup = false
    const native = t.mock.method(ChildProcess, 'spawn')
    h.faults.beforeRemove = () => {
      assert.ok(
        native.mock.callCount() > 0,
        'Full rollback verification must precede temporary-only cleanup'
      )
    }
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.strictEqual(
      run.recoveryCapability,
      full,
      'Removing temporary files cannot acknowledge interfered history'
    )
    assert.equal(h.failure().retry, 'recovery')
    assert.equal(await tip(h.repository), externalTip)
    h.faults.beforeRemove = undefined
    await rawGit(h.repository, ['update-ref', 'HEAD', runTip, externalTip])
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.equal(run.recoveryCapability, undefined)
    assert.equal(run.cleanupPending, false)
    assert.equal(run.cleanupToken, undefined)
    assert.equal(h.state(h.repository).changesState.assistedCommit.kind, 'idle')
    assert.equal(await tip(h.repository), h.originalHead)
    assert.equal(
      await rawGit(h.repository, ['rev-parse', 'refs/heads/external']),
      externalTip
    )
    assert.equal(h.propose.mock.callCount(), 1)
    await h.unchanged()
  })
})
