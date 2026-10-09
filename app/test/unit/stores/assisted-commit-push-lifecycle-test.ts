import assert from 'node:assert'
import { describe, it } from 'node:test'
import { cp, rename, rm, symlink, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { Repository } from '../../../src/models/repository'
import { createAssistedCommitRunHarness } from '../../helpers/assisted-commit-run'
import { addBareRemote } from '../../helpers/assisted-commit-push'
import { count, rawGit, seed, tip } from '../../helpers/assisted-commit'
import { createTempDirectory } from '../../helpers/temp'
import {
  deferred,
  wholeSelectionResponse,
} from '../../helpers/copilot-assisted-commit'
import { assistedCommitErrorCauses } from '../../../src/lib/assisted-commit-run'
import { acquireAssistedCommitGitLease } from '../../../src/lib/git/repository-operation'
import { SelectionType } from '../../../src/lib/app-state'

describe('assisted push lifecycle ownership', () => {
  for (const refusal of ['alias', 'busy'] as const) {
    it(`publishes the actual early ${refusal} retry refusal to AppStore subscribers`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      const foreign = await seed(t, { unrelated: 'Foreign checkout\n' })
      await writeFile(
        join(remote.path, 'hooks', 'pre-receive'),
        '#!/bin/sh\necho "Original receiver rejection" >&2\nexit 1\n',
        { mode: 0o755 }
      )
      await writeFile(join(source.path, 'file'), 'after\n')
      const alias = join(await createTempDirectory(t), 'execution-alias')
      await symlink(source.path, alias, 'junction')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(
        new Repository(alias, -1, null, false)
      )
      h.appStore['selectedRepository'] = repository
      let renderedMessage: string | undefined
      const subscription = h.appStore.onDidUpdate(state => {
        const selected = state.selectedState
        if (selected?.type === SelectionType.Repository) {
          const assisted = selected.state.changesState.assistedCommit
          if (assisted.kind === 'push-error') {
            renderedMessage = assisted.error.message
          }
        }
      })
      t.after(() => subscription.dispose())
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const initial = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(initial.kind === 'push-error')
      assert.strictEqual(renderedMessage, initial.error.message)
      assert.match(renderedMessage, /Original receiver rejection/)
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'push-error')
      const lease =
        refusal === 'busy'
          ? await acquireAssistedCommitGitLease(source.path)
          : undefined
      if (refusal === 'alias') {
        await unlink(alias)
        await symlink(foreign.path, alias, 'junction')
      }
      try {
        const outcome = await h.dispatcher.retryCopilotAssistedCommitPush(
          new Repository(source.path, repository.id, null, false),
          state.runId
        )
        assert.ok(outcome?.kind === 'push-error')
        assert.notStrictEqual(outcome.error.message, initial.error.message)
        assert.strictEqual(renderedMessage, outcome.error.message)
        assert.match(
          renderedMessage,
          refusal === 'alias' ? /changed|alias/ : /Git operation/
        )
        assert.strictEqual(await count(source), 2)
        assert.strictEqual(await remote.tip(), remote.originalTip)
        assert.strictEqual(h.propose.mock.callCount(), 1)
        assert.strictEqual(h.commits.mock.callCount(), 1)
      } finally {
        lease?.release()
      }
    })
  }

  it('refuses a retargeted execution alias before waiting on a foreign retained lease', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    const foreign = await seed(t, { unrelated: 'Foreign checkout\n' })
    await writeFile(
      join(remote.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\nexit 1\n',
      { mode: 0o755 }
    )
    await writeFile(join(source.path, 'file'), 'after\n')
    const alias = join(await createTempDirectory(t), 'execution-alias')
    await symlink(source.path, alias, 'junction')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(new Repository(alias, -1, null, false))
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const initial = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(initial.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    const retainedTip = await tip(source)
    const foreignTip = await tip(foreign)
    const foreignLease = await acquireAssistedCommitGitLease(foreign.path)
    await unlink(alias)
    await symlink(foreign.path, alias, 'junction')
    const requested = new Repository(source.path, repository.id, null, false)
    const retry = h.dispatcher
      .retryCopilotAssistedCommitPush(requested, state.runId)
      .then(outcome => ({ kind: 'settled', outcome } as const))
    let timer: NodeJS.Timeout | undefined
    try {
      const observed = await Promise.race([
        retry,
        new Promise<{ readonly kind: 'blocked' }>(resolve => {
          timer = setTimeout(() => resolve({ kind: 'blocked' }), 1000)
        }),
      ])
      assert.ok(observed.kind === 'settled', observed.kind)
      assert.ok(observed.outcome?.kind === 'push-error')
      assert.match(observed.outcome.error.message, /changed|alias/)
      const settled = h.state(repository).changesState.assistedCommit
      assert.ok(settled.kind === 'push-error')
      assert.strictEqual(settled.settling, false)
      assert.strictEqual(h.state(repository).isCommitting, false)
    } finally {
      clearTimeout(timer)
      foreignLease.release()
      await retry
    }
    assert.strictEqual(await tip(source), retainedTip)
    assert.strictEqual(await tip(foreign), foreignTip)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(await count(source), 2)
    assert.strictEqual(await count(foreign), 1)
    assert.strictEqual(h.propose.mock.callCount(), 1)
    assert.strictEqual(h.commits.mock.callCount(), 1)
  })

  it('fences the actual execution symlink as well as a requested canonical alias on retry', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(
      join(remote.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\nexit 1\n',
      { mode: 0o755 }
    )
    await writeFile(join(source.path, 'file'), 'after\n')
    const alias = join(await createTempDirectory(t), 'execution-alias')
    await symlink(source.path, alias, __WIN32__ ? 'junction' : 'dir')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(new Repository(alias, -1, null, false))
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    const fullTip = await tip(repository)
    const replacement = join(await createTempDirectory(t), 'replacement')
    await cp(source.path, replacement, { recursive: true })
    await rm(alias)
    await symlink(replacement, alias, __WIN32__ ? 'junction' : 'dir')
    await unlink(join(remote.path, 'hooks', 'pre-receive'))
    const requested = new Repository(source.path, repository.id, null, false)
    const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
      requested,
      state.runId
    )
    assert.ok(retry?.kind === 'push-error')
    assert.match(retry.error.message, /changed/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(await tip(requested), fullTip)
    assert.strictEqual(
      await tip(new Repository(replacement, -1, null, false)),
      fullTip
    )
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  it('retry targets repository A after switching UI to repository B, leaving B history, files and preference untouched', async t => {
    const sourceA = await seed(t, { file: 'A before\n' })
    const remoteA = await addBareRemote(t, sourceA)
    const sourceB = await seed(t, { file: 'B before\n' })
    const remoteB = await addBareRemote(t, sourceB)
    await writeFile(
      join(remoteA.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\nexit 1\n',
      { mode: 0o755 }
    )
    await writeFile(join(sourceA.path, 'file'), 'A after\n')
    await writeFile(join(sourceB.path, 'file'), 'B uncommitted\n')
    const h = await createAssistedCommitRunHarness(t)
    const repositoryA = await h.register(sourceA)
    const repositoryB = await h.register(sourceB)
    h.dispatcher.setPushAfterAssistedCommit(repositoryA, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repositoryA,
      h.request(repositoryA)
    )
    assert.ok(outcome.kind === 'push-error')
    const state = h.state(repositoryA).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    h.appStore['selectedRepository'] = repositoryB
    await unlink(join(remoteA.path, 'hooks', 'pre-receive'))
    const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
      repositoryA,
      state.runId
    )
    assert.ok(retry?.kind === 'pushed')
    assert.strictEqual(await remoteA.tip(), await tip(repositoryA))
    assert.strictEqual(await remoteB.tip(), remoteB.originalTip)
    assert.strictEqual(await count(repositoryB), 1)
    assert.strictEqual(
      h.state(repositoryB).changesState.pushAfterAssistedCommit,
      false
    )
    assert.strictEqual(
      await rawGit(repositoryB, ['diff', '--name-only', '--']),
      'file'
    )
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  for (const change of ['extra-commit', 'other-branch'] as const) {
    it(`refuses stale retry after ${change} without resetting external history`, async t => {
      const source = await seed(t, { file: 'before\n' })
      const remote = await addBareRemote(t, source)
      await writeFile(
        join(remote.path, 'hooks', 'pre-receive'),
        '#!/bin/sh\nexit 1\n',
        { mode: 0o755 }
      )
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      h.dispatcher.setPushAfterAssistedCommit(repository, true)
      const outcome = await h.dispatcher.createCopilotAssistedCommits(
        repository,
        h.request(repository)
      )
      assert.ok(outcome.kind === 'push-error')
      const state = h.state(repository).changesState.assistedCommit
      assert.ok(state.kind === 'push-error')
      await unlink(join(remote.path, 'hooks', 'pre-receive'))
      await rawGit(
        repository,
        change === 'extra-commit'
          ? ['commit', '--allow-empty', '-m', 'External commit']
          : ['checkout', '-b', 'other-branch']
      )
      const externalTip = await tip(repository)
      const externalRef = await rawGit(repository, ['symbolic-ref', 'HEAD'])
      const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
        repository,
        state.runId
      )
      assert.ok(retry?.kind === 'push-error')
      assert.match(retry.error.message, /changed/)
      assert.strictEqual(await tip(repository), externalTip)
      assert.strictEqual(
        await rawGit(repository, ['symbolic-ref', 'HEAD']),
        externalRef
      )
      assert.strictEqual(
        await count(repository),
        change === 'extra-commit' ? 3 : 2
      )
      assert.strictEqual(await remote.tip(), remote.originalTip)
      assert.strictEqual(h.propose.mock.callCount(), 1)
      assert.strictEqual(h.commits.mock.callCount(), 1)
    })
  }

  it('keeps the actual push failure inline when accepted-commit statistics also fail', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(
      join(remote.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho "actual fixture push failure" >&2\nexit 1\n',
      { mode: 0o755 }
    )
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    const statisticsFailure = new Error('Synthetic statistics write failure')
    h.commits.mock.mockImplementation(() => {
      throw statisticsFailure
    })
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    assert.match(state.error.message, /actual fixture push failure/)
    assert.ok(
      assistedCommitErrorCauses(state.error).includes(statisticsFailure)
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })

  it('refuses a physically replaced repository even when path, HEAD, index, and remote configuration are identical', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(
      join(remote.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho "fixture rejection" >&2\nexit 1\n',
      { mode: 0o755 }
    )
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    const fullTip = await tip(repository)
    const saved = join(await createTempDirectory(t), 'original')
    await rename(repository.path, saved)
    await cp(saved, repository.path, { recursive: true })
    await unlink(join(remote.path, 'hooks', 'pre-receive'))
    const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
      repository,
      state.runId
    )
    assert.ok(retry?.kind === 'push-error')
    assert.match(retry.error.message, /repository.*changed/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
    assert.strictEqual(await tip(repository), fullTip)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(await count(new Repository(saved, -1, null, false)), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  it('rejects ordinary Push at admission instead of waiting on its own metadata read behind an assisted lease', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
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
    const run = h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    await analyzing.promise
    let settled = false
    const push = h.appStore._push(repository).then(
      () => {
        settled = true
        return undefined
      },
      error => {
        settled = true
        return error
      }
    )
    await new Promise<void>(resolve => setImmediate(resolve))
    const rejectedBeforeRelease = settled
    finish.resolve()
    await run
    const error = await push
    assert.strictEqual(rejectedBeforeRelease, true)
    assert.ok(error instanceof Error)
    assert.match(error.message, /assisted commit/)
    assert.strictEqual(await remote.tip(), remote.originalTip)
  })

  it('expires an already-queued retry if its exact run was dismissed before admission', async t => {
    const source = await seed(t, { file: 'before\n' })
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    const retry = h.dispatcher.retryCopilotAssistedCommitPush(
      repository,
      state.runId
    )
    h.dispatcher.dismissCopilotAssistedCommitError(repository, state.runId)
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    await retry
    assert.strictEqual(
      h.state(repository).changesState.assistedCommit.kind,
      'idle'
    )
    assert.strictEqual(
      h.appStore['assistedCommitRuns'].has(repository.id),
      false
    )
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })

  it('certifies a physical path alias without rebinding the original push destination or tip', async t => {
    const source = await seed(t, { file: 'before\n' })
    const remote = await addBareRemote(t, source)
    await writeFile(
      join(remote.path, 'hooks', 'pre-receive'),
      '#!/bin/sh\necho "fixture rejection" >&2\nexit 1\n',
      { mode: 0o755 }
    )
    await writeFile(join(source.path, 'file'), 'after\n')
    const h = await createAssistedCommitRunHarness(t)
    const repository = await h.register(source)
    h.dispatcher.setPushAfterAssistedCommit(repository, true)
    const outcome = await h.dispatcher.createCopilotAssistedCommits(
      repository,
      h.request(repository)
    )
    assert.ok(outcome.kind === 'push-error')
    const state = h.state(repository).changesState.assistedCommit
    assert.ok(state.kind === 'push-error')
    const fullTip = await tip(repository)
    await unlink(join(remote.path, 'hooks', 'pre-receive'))
    const aliasPath = join(await createTempDirectory(t), 'alias')
    await symlink(repository.path, aliasPath, __WIN32__ ? 'junction' : 'dir')
    const alias = new Repository(aliasPath, repository.id, null, false, 'Alias')
    const retry = await h.dispatcher.retryCopilotAssistedCommitPush(
      alias,
      state.runId
    )
    assert.ok(
      retry?.kind === 'pushed',
      retry?.kind === 'push-error' ? retry.error.message : JSON.stringify(retry)
    )
    assert.strictEqual(await remote.tip(), fullTip)
    assert.strictEqual(await tip(repository), fullTip)
    assert.strictEqual(await count(repository), 2)
    assert.strictEqual(h.propose.mock.callCount(), 1)
  })
})
