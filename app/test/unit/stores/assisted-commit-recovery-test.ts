import { TestContext, it, describe } from 'node:test'
import {
  partialSelectionFixture,
  createAssistedCommitRunHarness,
} from '../../helpers/assisted-commit-run'
import {
  rawGit,
  optionalBytes,
  indexPath,
  seed,
  count,
} from '../../helpers/assisted-commit'
import { AssistedCommitError } from '../../../src/lib/git/assisted-commit'
import assert from 'node:assert'
import { join } from 'path'
import { DiffSelectionType } from '../../../src/models/diff'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { writeFile } from 'fs/promises'
import {
  wholeSelectionResponse,
  splitResponse,
  deferred,
} from '../../helpers/copilot-assisted-commit'

async function rolledBackRefreshFixture(t: TestContext) {
  const { h, repository } = await partialSelectionFixture(t)
  const originalHead = await rawGit(repository, ['rev-parse', 'HEAD'])
  const originalIndex = await optionalBytes(await indexPath(repository))
  const refresh = h.assisted.recovery.refresh.bind(h.assisted.recovery)
  let failedRefresh = false
  t.mock.method(
    h.assisted.recovery,
    'refresh',
    async (...args: Parameters<typeof refresh>) => {
      const [repo, afterSuccess] = args
      if (afterSuccess) {
        h.cancel(repository)
        throw new AssistedCommitError(
          'cancelled',
          'Cancelled before acceptance'
        )
      }
      if (!failedRefresh) {
        failedRefresh = true
        throw new Error('Transient post-rollback status failure')
      }
      return refresh(repo, afterSuccess)
    }
  )
  await h.dispatcher.createCopilotAssistedCommits(
    repository,
    h.request(repository)
  )
  const state = h.state(repository).changesState.assistedCommit
  assert.ok(state.kind === 'error' && state.retry === 'refresh')
  const run = h.assisted.state.runs.get(repository.id)
  assert.ok(run?.finished && run.result !== undefined)
  assert.strictEqual(run.recovery?.history, 'restored')
  assert.strictEqual(run.recovery?.index, 'restored')
  assert.strictEqual(run.recoveryCapability, undefined)
  assert.strictEqual(run.cleanupPending, false)
  assert.strictEqual(run.lease, undefined)
  assert.strictEqual(
    await rawGit(repository, ['rev-parse', 'HEAD']),
    originalHead
  )
  assert.deepStrictEqual(
    await optionalBytes(await indexPath(repository)),
    originalIndex
  )
  return { h, repository, state, run }
}

describe('AppStore assisted commit recovery and refresh retry', () => {
  for (const change of ['branch', 'commit'] as const) {
    it(`settles refresh-only recovery after completed rollback and an external ${change}`, async t => {
      const { h, repository, state, run } = await rolledBackRefreshFixture(t)
      const workingBytes = await optionalBytes(join(repository.path, 'file'))
      if (change === 'branch') {
        await rawGit(repository, ['switch', '-c', 'external-branch'])
      } else {
        await rawGit(repository, [
          'commit',
          '--allow-empty',
          '-m',
          'External commit',
        ])
      }
      const externalHead = await rawGit(repository, ['rev-parse', 'HEAD'])
      await h.dispatcher.retryCopilotAssistedCommitRecovery(
        repository,
        state.runId
      )
      const settled = h.state(repository).changesState.assistedCommit
      assert.ok(settled.kind === 'error' && settled.retry === null)
      assert.strictEqual(settled.selectionNeedsReview, true)
      assert.strictEqual(run.resourceProtection, undefined)
      assert.doesNotThrow(() => h.assisted.state.assertAvailable(repository))
      assert.ok(
        h
          .state(repository)
          .changesState.workingDirectory.files.every(
            file => file.selection.getSelectionType() === DiffSelectionType.None
          )
      )
      assert.strictEqual(
        await rawGit(repository, ['rev-parse', 'HEAD']),
        externalHead
      )
      assert.deepStrictEqual(
        await optionalBytes(join(repository.path, 'file')),
        workingBytes
      )
      assert.strictEqual(h.propose.mock.callCount(), 1)
      assert.strictEqual(h.commits.mock.callCount(), 0)
      h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
      assert.strictEqual(
        h.state(repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  it('still rejects HEAD changing during refresh-only reconciliation after rollback', async t => {
    const { h, repository, state, run } = await rolledBackRefreshFixture(t)
    const getDiff = h.assisted.selections['getRecoveryDiff'].bind(
      h.assisted.selections
    )
    let changed = false
    t.mock.method(
      h.assisted.selections,
      'getRecoveryDiff',
      async (...args: Parameters<typeof getDiff>) => {
        const diff = await getDiff(...args)
        if (!changed) {
          changed = true
          await rawGit(repository, ['switch', '-c', 'during-reconciliation'])
        }
        return diff
      }
    )
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    const failed = h.state(repository).changesState.assistedCommit
    assert.ok(failed.kind === 'error' && failed.retry === 'refresh')
    assert.ok(
      assistedCommitErrorCauses(failed.error).some(
        error =>
          error instanceof AssistedCommitError &&
          error.code === 'repository-changed'
      )
    )
    assert.ok(run.resourceProtection !== undefined)
    assert.throws(() => h.assisted.state.assertAvailable(repository))
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      state.runId
    )
    const settled = h.state(repository).changesState.assistedCommit
    assert.ok(settled.kind === 'error' && settled.retry === null)
    assert.strictEqual(settled.selectionNeedsReview, true)
    assert.strictEqual(run.resourceProtection, undefined)
  })

  it('does not suppress an independent reconciliation failure behind domain cancellation', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const failure = new Error('Status reconciliation unavailable')
    h.assisted.recovery['restore'] = async () => {
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
    const observer = h.assisted.context['progress'].bind(h.assisted.context)
    h.assisted.context['progress'] = async (run, progress) => {
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
    h.assisted.recovery['restore'] = async () => false
    const refreshError = new Error('Post-recovery refresh failed')
    h.appStore._refreshRepository = async () => {
      throw refreshError
    }
    h.assisted.readers['deferredRefreshes'].set(repository.id, repository)
    await h.dispatcher.retryCopilotAssistedCommitRecovery(
      repository,
      failed.runId
    )
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error' && state.retry === 'refresh')
    assert.ok(assistedCommitErrorCauses(state.error).includes(refreshError))
    assert.strictEqual(h.state(repository).isCommitting, false)
  })

  it('locks refresh-only errors until current selections have been reconciled', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.assisted.recovery['restore'] = async () => {
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
      const run = h.assisted.state['runs'].get(repository.id)
      if (
        !waiting &&
        run?.reconciling &&
        !h.assisted.readers['deferredRefreshes'].has(repository.id)
      ) {
        waiting = true
        refreshing.resolve()
        await finish.promise
      }
      return refresh(repo)
    }
    h.propose.mock.mockImplementation(async (_account, analysis) => {
      h.assisted.readers['deferredRefreshes'].set(repository.id, repository)
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

  it('settles a successful refresh retry even when its idle observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const restore = h.assisted.recovery['restore'].bind(h.assisted.recovery)
    h.assisted.recovery['restore'] = async () => {
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
    h.assisted.recovery['restore'] = restore
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
    assert.strictEqual(h.assisted.state['runs'].has(repository.id), false)
    assert.strictEqual(await count(repository), 1)
  })

  for (const action of ['retry', 'dismiss'] as const) {
    it(`preserves a replacement run started by an idle subscriber during ${action}`, async t => {
      const source = await seed(t, { file: 'before\n' })
      await writeFile(join(source.path, 'file'), 'selected\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const restore = h.assisted.recovery['restore'].bind(h.assisted.recovery)
      if (action === 'retry') {
        h.assisted.recovery['restore'] = async () => {
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
      h.assisted.recovery['restore'] = restore
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
      h.assisted.readers['deferredRefreshes'].set(repository.id, repository)
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
    const preserved = h.assisted.state['runs'].has(repository.id)
    finish.resolve()
    const outcome = await operation
    assert.strictEqual(preserved, true)
    assert.ok('result' in outcome && outcome.result.kind === 'error')
    assert.strictEqual(h.state(repository).isCommitting, false)
    assert.strictEqual(await count(repository), 1)
  })

  it('keeps retry ownership settled when its first observer throws', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'selected\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const restore = h.assisted.recovery['restore'].bind(h.assisted.recovery)
    h.assisted.recovery['restore'] = async () => {
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
    h.assisted.recovery['restore'] = restore
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
      h.assisted.state['runs'].get(repository.id)?.finished,
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
    const owned = h.assisted.state['runs'].get(repository.id)
    assert.ok(owned)
    const reader = new Error('Synthetic repeated reader failure')
    h.assisted.readers['invalidate'](repository, owned, reader)
    h.assisted.readers['invalidate'](repository, owned, reader)
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'error')
    assert.ok(assistedCommitErrorCauses(state.error).includes(original))
    assert.ok(assistedCommitErrorCauses(state.error).includes(reader))
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
      h.assisted.readers['deferredRefreshes'].set(repository.id, repository)
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
})
