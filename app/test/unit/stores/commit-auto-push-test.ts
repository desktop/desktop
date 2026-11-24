import assert from 'node:assert'
import { before, describe, it, mock, TestContext } from 'node:test'
import { writeFile, unlink, readFile } from 'fs/promises'
import { promises as FileSystem } from 'fs'
import { join } from 'path'
import type { ICommitContext } from '../../../src/models/commit'
import type { createAssistedCommitRunHarness as Harness } from '../../helpers/assisted-commit-run'
let remotes: typeof import('../../helpers/assisted-commit-push')
let fixtures: typeof import('../../helpers/assisted-commit')
let operations: typeof import('../../../src/lib/git/repository-operation')
let errors: typeof import('../../../src/lib/error-with-metadata')
let retries: typeof import('../../../src/models/retry-actions')
let native: typeof import('../../../src/lib/git/assisted-commit')
let createAssistedCommitRunHarness: typeof Harness
const commands: string[] = []
before(async () => {
  mock.module('../../../src/ui/lib/git-perf.ts', {
    namedExports: {
      measure: <T>(name: string, operation: () => Promise<T>) => {
        commands.push(name)
        return operation()
      },
    },
  })
  ;({ createAssistedCommitRunHarness } = await import(
    '../../helpers/assisted-commit-run'
  ))
  remotes = await import('../../helpers/assisted-commit-push')
  fixtures = await import('../../helpers/assisted-commit')
  operations = await import('../../../src/lib/git/repository-operation')
  errors = await import('../../../src/lib/error-with-metadata')
  retries = await import('../../../src/models/retry-actions')
  native = await import('../../../src/lib/git/assisted-commit')
})

async function setup(
  t: TestContext,
  mode: 'manual' | 'copilot',
  publish = true
) {
  const source = await fixtures.seed(t, { file: 'before\n' })
  const remote = await remotes.addBareRemote(t, source, { publish })
  await writeFile(join(source.path, 'file'), 'after\n')
  const h = await createAssistedCommitRunHarness(t)
  const repository = await h.register(source)
  h.dispatcher.setCommitMode(repository, mode)
  h.dispatcher.setPushAfterCommit(repository, true)
  const refresh = t.mock.method(h.appStore, '_refreshRepository')
  const failures: Error[] = []
  h.appStore.onDidError(error => failures.push(error))
  const pushes = t.mock.method(h.statsStore, 'recordPush')
  const publications: Promise<void>[] = []
  const settleRefresh = () =>
    Promise.all(refresh.mock.calls.map(call => call.result))
  const settle = async () => {
    await Promise.all(publications)
    await settleRefresh()
  }
  const commit = async (context: Partial<ICommitContext> = {}) => {
    const publish = h.appStore['pushAfterCommit'].bind(h.appStore)
    h.appStore['pushAfterCommit'] = (...args) => {
      const publication = publish(...args)
      publications.push(publication)
      return publication
    }
    const outcome =
      mode === 'manual'
        ? await h.dispatcher.commitIncludedChanges(repository, {
            summary: 'Manual commit',
            description: '',
            ...context,
          })
        : await h.dispatcher.createCopilotAssistedCommits(
            repository,
            h.request(repository)
          )
    await settle()
    return outcome
  }
  return {
    ...h,
    repository,
    source,
    remote,
    failures,
    pushes,
    commit,
    settle,
    settleRefresh,
  }
}

describe('automatic commit publication uses ordinary Push', () => {
  for (const mode of ['manual', 'copilot'] as const) {
    it(`${mode} pushes an explicitly empty commit without model work`, async t => {
      const h = await setup(t, mode)
      const files = h.state(h.repository).changesState.workingDirectory.files
      await h.dispatcher.changeFileIncluded(h.repository, files, false)
      h.dispatcher.updateCommitOptions(h.repository, { allowEmptyCommit: true })
      await h.commit()
      assert.deepStrictEqual(h.failures, [])
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.strictEqual(await h.remote.tip(), await fixtures.tip(h.repository))
      assert.strictEqual(h.propose.mock.callCount(), 0)
    })

    it(`${mode} accepts and releases commit ownership before ordinary Push, without destination certificates`, async t => {
      const source = await fixtures.seed(t, { file: 'before\n' })
      const remote = await remotes.addBareRemote(t, source)
      await writeFile(join(source.path, 'file'), 'after\n')
      const h = await createAssistedCommitRunHarness(t)
      const repository = await h.register(source)
      const errors: Error[] = []
      h.appStore.onDidError(error => errors.push(error))
      h.dispatcher.setCommitMode(repository, mode)
      h.dispatcher.setPushAfterCommit(repository, true)
      const refresh = t.mock.method(h.appStore, '_refreshRepository')
      const publication = t.mock.fn(
        h.appStore['pushAfterCommit'].bind(h.appStore)
      )
      h.appStore['pushAfterCommit'] = publication
      commands.length = 0
      const push = h.appStore._push.bind(h.appStore)
      const ordinaryPush = t.mock.method(
        h.appStore,
        '_push',
        async (...args: Parameters<typeof push>) => {
          assert.strictEqual(args[0].id, repository.id)
          assert.strictEqual(
            operations.isRepositoryAffectedByAssistedCommit(source.path),
            false
          )
          assert.strictEqual(
            operations.isRepositoryGitMutationInProgress(source.path),
            false
          )
          assert.strictEqual(h.state(repository).isCommitting, false)
          assert.strictEqual(
            h.assisted.state.runs.get(repository.id)?.lease,
            undefined
          )
          return push(...args)
        }
      )
      if (mode === 'manual') {
        assert.strictEqual(
          await h.dispatcher.commitIncludedChanges(repository, {
            summary: 'Manual commit',
            description: '',
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
      await Promise.all(publication.mock.calls.map(call => call.result))
      await Promise.all(refresh.mock.calls.map(call => call.result))
      console.log(
        `${mode} native push prefix: ${commands.findIndex(command =>
          command.startsWith('push: git push')
        )} Git calls; ${
          commands.filter(command =>
            /assistedPush|assistedPublication/.test(command)
          ).length
        } push certification calls`
      )
      assert.strictEqual(ordinaryPush.mock.callCount(), 1)
      assert.deepStrictEqual(errors, [])
      assert.strictEqual(h.appStore['popupManager'].currentPopup, null)
      assert.deepStrictEqual(
        commands.filter(command =>
          /assistedPush|assistedPublication/.test(command)
        ),
        []
      )
      assert.strictEqual(await remote.tip(), await fixtures.tip(source))
      assert.strictEqual(await fixtures.count(source), 2)
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(h.propose.mock.callCount(), mode === 'manual' ? 0 : 1)
    })
  }

  for (const excluded of [
    'amend',
    'tutorial',
    'merge',
    'cherry-pick',
    'squash',
  ] as const) {
    it(`keeps manual ${excluded} publication explicit`, async t => {
      const h = await setup(t, 'manual')
      if (excluded === 'tutorial') {
        Object.defineProperty(h.repository, 'isTutorialRepository', {
          value: true,
        })
      } else if (excluded === 'merge' || excluded === 'cherry-pick') {
        await writeFile(
          join(
            h.source.path,
            '.git',
            excluded === 'merge' ? 'MERGE_HEAD' : 'CHERRY_PICK_HEAD'
          ),
          `${h.remote.originalTip}\n`
        )
      } else if (excluded === 'squash') {
        await writeFile(join(h.source.path, '.git', 'SQUASH_MSG'), 'Squash\n')
      }
      const push = t.mock.method(h.appStore, '_push')
      assert.strictEqual(await h.commit({ amend: excluded === 'amend' }), true)
      assert.strictEqual(push.mock.callCount(), 0)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
    })
  }

  it('manual partial commits keep the unselected hunk local while ordinary Push publishes selected history', async t => {
    const { partialSelectionFixture } = await import(
      '../../helpers/assisted-commit-run'
    )
    const { h, repository } = await partialSelectionFixture(t)
    const remote = await remotes.addBareRemote(t, repository)
    h.dispatcher.setCommitMode(repository, 'manual')
    h.dispatcher.setPushAfterCommit(repository, true)
    const refresh = t.mock.method(h.appStore, '_refreshRepository')
    const publication = t.mock.fn(
      h.appStore['pushAfterCommit'].bind(h.appStore)
    )
    h.appStore['pushAfterCommit'] = publication
    assert.strictEqual(
      await h.dispatcher.commitIncludedChanges(repository, {
        summary: 'Partial manual commit',
        description: '',
      }),
      true
    )
    await Promise.all(publication.mock.calls.map(call => call.result))
    await Promise.all(refresh.mock.calls.map(call => call.result))
    assert.strictEqual(await remote.tip(), await fixtures.tip(repository))
    assert.match(
      await fixtures.rawGit(repository, ['diff', '--', 'file']),
      /selected suffix/
    )
    assert.doesNotMatch(
      await fixtures.rawGit(repository, ['show', 'HEAD:file']),
      /selected suffix/
    )
  })

  it('reports a busy automatic push and retries after the active fetch without recommitting', async t => {
    const { deferred } = await import('../../helpers/copilot-assisted-commit')
    const { FetchType } = await import('../../../src/models/fetch')
    const h = await setup(t, 'manual')
    const store = h.appStore['gitStoreCache'].get(h.repository)
    const started = deferred<void>()
    const finish = deferred<void>()
    t.mock.method(store, 'fetch', async () => {
      started.resolve()
      await finish.promise
    })
    const fetching = h.appStore._fetch(h.repository, FetchType.BackgroundTask)
    try {
      await started.promise
      assert.strictEqual(await h.commit(), true)
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
      assert.strictEqual(h.pushes.mock.callCount(), 0)
      assert.strictEqual(h.failures.length, 1)
      const error = h.failures[0]
      assert.ok(error instanceof errors.ErrorWithMetadata)
      assert.match(error.message, /repository is busy/i)
      assert.strictEqual(
        error.metadata.retryAction?.type,
        retries.RetryActionType.Push
      )
    } finally {
      finish.resolve()
      await fetching
      await h.settle()
    }
    const error = h.failures[0]
    assert.ok(error instanceof errors.ErrorWithMetadata)
    const retry = error.metadata.retryAction
    assert.ok(retry?.type === retries.RetryActionType.Push)
    await h.dispatcher.performRetry(retry)
    await h.settle()
    assert.strictEqual(await h.remote.tip(), await fixtures.tip(h.repository))
    assert.strictEqual(await fixtures.count(h.repository), 2)
    assert.strictEqual(h.commits.mock.callCount(), 1)
    assert.strictEqual(h.propose.mock.callCount(), 0)
    assert.strictEqual(h.pushes.mock.callCount(), 1)
    assert.strictEqual(h.failures.length, 1)
  })

  for (const mode of ['manual', 'copilot'] as const) {
    it(`${mode} uses ordinary Publish guidance without inventing a remote`, async t => {
      const h = await setup(t, mode)
      await fixtures.rawGit(h.repository, ['remote', 'remove', 'origin'])
      await h.commit()
      const { PopupType } = await import('../../../src/models/popup')
      assert.strictEqual(
        h.appStore['popupManager'].currentPopup?.type,
        PopupType.PublishRepository
      )
      assert.strictEqual(await fixtures.rawGit(h.repository, ['remote']), '')
      assert.strictEqual(await fixtures.count(h.repository), 2)
    })
  }

  for (const mode of ['manual', 'copilot'] as const) {
    it(`${mode} keeps accepted local commits on receiver failure and ordinary retry neither analyzes nor commits`, async t => {
      const h = await setup(t, mode)
      const hook = join(h.remote.path, 'hooks', 'pre-receive')
      await writeFile(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
      await h.dispatcher.setCommitMessage(h.repository, {
        summary: 'Manual draft',
        description: 'Details',
        timestamp: Date.now(),
      })
      h.dispatcher.updateCommitOptions(h.repository, { allowEmptyCommit: true })
      const outcome = await h.commit()
      assert.strictEqual(
        mode === 'manual'
          ? outcome
          : typeof outcome === 'object' && outcome.kind,
        mode === 'manual' ? true : 'local-ready'
      )
      const committed = await fixtures.tip(h.repository)
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(h.pushes.mock.callCount(), 0)
      assert.strictEqual(h.state(h.repository).allowEmptyCommit, false)
      assert.strictEqual(
        h.state(h.repository).changesState.commitMessage.summary,
        mode === 'manual' ? '' : 'Manual draft'
      )
      assert.strictEqual(
        h.state(h.repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(h.assisted.state.runs.has(h.repository.id), false)
      const error = h.failures[0]
      assert.ok(error instanceof errors.ErrorWithMetadata)
      const retry = error.metadata.retryAction
      assert.ok(retry?.type === retries.RetryActionType.Push)
      assert.deepStrictEqual(Object.keys(retry), ['type', 'repository'])
      await unlink(hook)
      await h.dispatcher.performRetry(retry)
      await h.settle()
      assert.strictEqual(h.failures.length, 1)
      assert.strictEqual(await h.remote.tip(), committed)
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(h.pushes.mock.callCount(), 1)
      assert.strictEqual(h.propose.mock.callCount(), mode === 'manual' ? 0 : 1)
    })

    for (const change of ['repository', 'branch'] as const) {
      it(`${mode} retains originating repository, but skips a changed branch before handoff (${change})`, async t => {
        const h = await setup(t, mode)
        const other = await fixtures.seed(t, { other: 'untouched\n' })
        const otherRemote = await remotes.addBareRemote(t, other)
        const otherRepository = await h.register(other)
        const handoff = h.appStore['pushAfterCommit'].bind(h.appStore)
        h.appStore['pushAfterCommit'] = async (...args) => {
          if (change === 'repository') {
            h.appStore['selectedRepository'] = otherRepository
          } else {
            await fixtures.rawGit(h.repository, ['checkout', '-b', 'different'])
          }
          return handoff(...args)
        }
        await h.commit()
        assert.strictEqual(
          await h.remote.tip(),
          change === 'repository'
            ? await fixtures.tip(h.repository)
            : h.remote.originalTip
        )
        assert.strictEqual(await otherRemote.tip(), otherRemote.originalTip)
        assert.strictEqual(await fixtures.count(otherRepository), 1)
        assert.strictEqual(await fixtures.count(h.repository), 2)
        assert.strictEqual(h.failures.length, change === 'branch' ? 1 : 0)
        if (change === 'branch') {
          assert.match(h.failures[0].message, /saved locally.*branch changed/)
        }
      })
    }

    it(`${mode} uses ordinary branch publication and pending tags, not a pinned-SHA policy`, async t => {
      const h = await setup(t, mode, false)
      await fixtures.rawGit(h.repository, [
        'tag',
        '-a',
        'pending-tag',
        '-m',
        'Pending tag',
      ])
      const gitStore = h.appStore['gitStoreCache'].get(h.repository)
      gitStore['addTagToPush']('pending-tag')
      await h.commit()
      assert.deepStrictEqual(h.failures, [])
      assert.strictEqual(await h.remote.tip(), await fixtures.tip(h.repository))
      assert.strictEqual(await h.remote.read(['tag', '--list']), 'pending-tag')
      assert.deepStrictEqual(gitStore.tagsToPush, [])
      assert.strictEqual(
        await fixtures.rawGit(h.repository, [
          'rev-parse',
          '--abbrev-ref',
          '@{upstream}',
        ]),
        'origin/master'
      )
    })

    it(`${mode} checks the branch after awaited remote loading at handoff`, async t => {
      const h = await setup(t, mode)
      const store = h.appStore['gitStoreCache'].get(h.repository)
      const load = store.loadRemotes.bind(store)
      const handoff = h.appStore['pushAfterCommit'].bind(h.appStore)
      let handingOff = false
      let changed = false
      h.appStore['pushAfterCommit'] = (...args) => {
        handingOff = true
        return handoff(...args)
      }
      t.mock.method(store, 'loadRemotes', async () => {
        await load()
        if (handingOff && !changed) {
          changed = true
          await fixtures.rawGit(h.repository, [
            'checkout',
            '-b',
            'changed-before-handoff',
          ])
        }
      })
      const push = t.mock.method(h.appStore, '_push')
      await h.commit()
      assert.strictEqual(push.mock.callCount(), 0)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.strictEqual(changed, true)
      assert.match(h.failures[0].message, /saved locally.*branch changed/)
    })

    it(`${mode} rejects a cached branch that differs from the checked status`, async t => {
      const h = await setup(t, mode)
      const store = h.appStore['gitStoreCache'].get(h.repository)
      const load = h.appStore._loadStatus.bind(h.appStore)
      const handoff = h.appStore['pushAfterCommit'].bind(h.appStore)
      let handingOff = false
      let changed = false
      h.appStore['pushAfterCommit'] = async (...args) => {
        await h.settleRefresh()
        handingOff = true
        return handoff(...args)
      }
      t.mock.method(
        h.appStore,
        '_loadStatus',
        async (...args: Parameters<typeof load>) => {
          const status = await load(...args)
          if (handingOff && args[2] === true && !changed) {
            changed = true
            await fixtures.rawGit(h.repository, [
              'checkout',
              '-b',
              'different-cached-branch',
            ])
            await store.loadStatus({ propagateErrors: true })
            h.stores.repositoryStateCache.updateBranchesState(
              h.repository,
              () => ({ tip: store.tip })
            )
          }
          return status
        }
      )
      const push = t.mock.method(h.appStore, '_push')
      await h.commit()
      assert.strictEqual(changed, true)
      assert.strictEqual(push.mock.callCount(), 0)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.match(h.failures[0].message, /saved locally.*Refresh/)
    })

    it(`${mode} counts an acknowledged push once even if its follow-up refresh fails`, async t => {
      const h = await setup(t, mode)
      h.appStore['refreshBranchProtectionState'] = async () => {
        throw new Error('Synthetic push refresh failure')
      }
      await h.commit()
      assert.strictEqual(await h.remote.tip(), await fixtures.tip(h.repository))
      assert.strictEqual(h.pushes.mock.callCount(), 1)
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(
        h.state(h.repository).changesState.assistedCommit.kind,
        'idle'
      )
      assert.strictEqual(h.failures.length, 1)
      assert.match(h.failures[0].message, /Synthetic push refresh failure/)
    })

    it(`${mode} never auto-pushes a failed local commit`, async t => {
      const h = await setup(t, mode)
      await fixtures.writeHook(h.repository, 'pre-commit', 'exit 1')
      await fixtures.writeHook(
        h.repository,
        'pre-push',
        'echo attempted > push-attempted'
      )
      const ordinaryPush = t.mock.method(h.appStore, '_push')
      await h.commit()
      assert.strictEqual(ordinaryPush.mock.callCount(), 0)
      assert.strictEqual(await fixtures.count(h.repository), 1)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
      assert.strictEqual(h.pushes.mock.callCount(), 0)
      await assert.rejects(readFile(join(h.source.path, 'push-attempted')), {
        code: 'ENOENT',
      })
    })

    it(`${mode} keeps local success when ordinary authentication is cancelled before push`, async t => {
      const h = await setup(t, mode)
      const ordinaryPush = t.mock.method(h.appStore, '_push', async () => {
        assert.strictEqual(h.state(h.repository).isCommitting, false)
        assert.strictEqual(
          operations.isRepositoryAffectedByAssistedCommit(h.repository.path),
          false
        )
        // Same no-op return as a dismissed ordinary account-selection flow.
      })
      await h.commit()
      assert.strictEqual(ordinaryPush.mock.callCount(), 1)
      assert.strictEqual(await fixtures.count(h.repository), 2)
      assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
      assert.strictEqual(h.commits.mock.callCount(), 1)
      assert.strictEqual(
        h.state(h.repository).changesState.assistedCommit.kind,
        'idle'
      )
    })
  }

  it('cancels before local acceptance with guarded rollback and never hands off', async t => {
    const h = await setup(t, 'copilot')
    const progress = h.assisted.context.progress.bind(h.assisted.context)
    h.assisted.context.progress = (run, value) => {
      progress(run, value)
      if (value.kind === 'committing') {
        h.cancel(h.repository)
      }
    }
    const push = t.mock.method(h.appStore, '_push')
    const outcome = await h.commit()
    assert.ok(typeof outcome === 'object' && outcome.kind === 'cancelled')
    assert.strictEqual(await fixtures.count(h.repository), 1)
    assert.strictEqual(push.mock.callCount(), 0)
    assert.strictEqual(h.commits.mock.callCount(), 0)
  })

  it('ends cancellation at fenced local acceptance, before handoff or any network prompt', async t => {
    const h = await setup(t, 'copilot')
    const accept = h.assisted.acceptLocal.bind(h.assisted)
    let accepted: Parameters<typeof accept>[0] | undefined
    h.assisted.acceptLocal = (run, result) => {
      accept(run, result)
      accepted = run
      h.dispatcher.cancelCopilotAssistedCommits(h.repository, run.id)
      assert.strictEqual(run.controller.signal.aborted, false)
    }
    const push = h.appStore._push.bind(h.appStore)
    t.mock.method(
      h.appStore,
      '_push',
      async (...args: Parameters<typeof push>) => {
        assert.ok(accepted?.result)
        assert.strictEqual(accepted.lease, undefined)
        assert.strictEqual(accepted.resourceProtection, undefined)
        await assert.rejects(
          native.rollbackAssistedCommitTransaction(accepted.result),
          /finalized|not Desktop-owned/i
        )
        return push(...args)
      }
    )
    await h.commit()
    assert.strictEqual(await fixtures.count(h.repository), 2)
    assert.strictEqual(await h.remote.tip(), await fixtures.tip(h.repository))
    assert.deepStrictEqual(h.failures, [])
  })

  it('does not hand off until required cleanup and recovery have settled', async t => {
    const h = await setup(t, 'copilot')
    const remove = FileSystem.rm
    let refuse = true
    t.mock.method(
      FileSystem,
      'rm',
      async (...args: Parameters<typeof remove>) => {
        if (
          refuse &&
          typeof args[0] === 'string' &&
          args[0].includes('desktop-assisted-commit-')
        ) {
          throw new Error('Synthetic snapshot cleanup failure')
        }
        return remove(...args)
      }
    )
    const push = t.mock.method(h.appStore, '_push')
    const outcome = await h.commit()
    assert.ok(typeof outcome === 'object' && outcome.kind === 'error')
    const run = h.assisted.state.runs.get(h.repository.id)
    assert.ok(run?.cleanupPending)
    assert.strictEqual(push.mock.callCount(), 0)
    assert.strictEqual(await h.remote.tip(), h.remote.originalTip)
    refuse = false
    await h.dispatcher.retryCopilotAssistedCommitRecovery(h.repository, run.id)
    assert.strictEqual(push.mock.callCount(), 0)
    assert.strictEqual(run.cleanupPending, false)
  })

  for (const mode of ['manual', 'copilot'] as const) {
    it(`${mode} skips auto-push ${
      mode === 'copilot'
        ? 'while accepted local readers still need refresh'
        : 'when preference is off'
    }`, async t => {
      const h = await setup(t, mode)
      if (mode === 'copilot') {
        const finish = h.assisted.readers.finish.bind(h.assisted.readers)
        h.assisted.readers.finish = async run => {
          await finish(run)
          run.selectionReadError = new Error('Synthetic reader refresh failure')
        }
      } else {
        h.dispatcher.setPushAfterCommit(h.repository, false)
      }
      const push = t.mock.method(h.appStore, '_push')
      await h.commit()
      assert.strictEqual(push.mock.callCount(), 0)
      assert.strictEqual(await fixtures.count(h.repository), 2)
    })
  }
})
