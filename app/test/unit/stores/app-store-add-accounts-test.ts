import assert from 'node:assert/strict'
import { after, before, describe, it, mock, TestContext } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import * as Path from 'path'
import { existsSync } from 'fs'
import type { AppStore } from '../../../src/lib/stores/app-store'
import { API, IAPIPullRequest } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import {
  isRepositoryWithGitHubRepository,
  Repository,
  RepositoryWithGitHubRepository,
} from '../../../src/models/repository'
import { Popup, PopupType } from '../../../src/models/popup'
import { createMockAPI, createMockAPIRepository } from '../../helpers/mock-api'
import type { ITestStores } from '../../helpers/app-store-test-harness'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'

describe('AppStore explicitly adding repositories', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase
  let stores: ITestStores
  const endpoint = 'https://api.github.com'
  const alice = new Account('alice', endpoint, 'alice-token', [], '', 1, '')
  const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, '')
  const apiRepository = {
    ...createMockAPIRepository(),
    parent: undefined,
    permissions: { pull: true, push: true, admin: false },
  }
  const apiPullRequest: IAPIPullRequest = {
    number: 42,
    title: 'Example pull request',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    user: apiRepository.owner,
    head: { ref: 'feature', sha: 'head', repo: apiRepository },
    base: { ref: 'main', sha: 'base', repo: apiRepository },
    body: '',
    state: 'open',
  }

  before(async () => {
    mock.module('../../../src/ui/main-process-proxy', {
      namedExports: {
        ...(await import('../../../src/ui/main-process-proxy')),
        getAppMenu: () => {},
        updateAccounts: () => {},
        updatePreferredAppMenuItemLabels: () => {},
      },
    })
    const { AppStore } = await import('../../../src/lib/stores/app-store')
    const { createTestStores } = await import(
      '../../helpers/app-store-test-harness'
    )
    stores = createTestStores()
    const { AliveStore } = await import('../../../src/lib/stores/alive-store')
    mock.method(AliveStore.prototype, 'setEnabled', () => {})
    const { CopilotStore } = await import(
      '../../../src/lib/stores/copilot-store'
    )
    const { NotificationsStore } = await import(
      '../../../src/lib/stores/notifications-store'
    )
    const { PullRequestCoordinator } = await import(
      '../../../src/lib/stores/pull-request-coordinator'
    )
    const { StatsStore } = await import('../../../src/lib/stats')
    const { TestStatsDatabase } = await import(
      '../../helpers/databases/test-stats-database'
    )
    const { TestActivityMonitor } = await import(
      '../../helpers/test-activity-monitor'
    )
    const { fakePost } = await import('../../fake-stats-post')
    mock.method(window, 'setTimeout', () => 0)
    mock.method(window, 'requestAnimationFrame', () => 0)
    mock.method(window, 'addEventListener', () => {})
    statsDb = new TestStatsDatabase()
    await statsDb.reset()
    const stats = new StatsStore(statsDb, new TestActivityMonitor(), fakePost)
    const coordinator = new PullRequestCoordinator(
      stores.pullRequestStore,
      stores.repositoriesStore
    )
    appStore = new AppStore(
      stores.gitHubUserStore,
      stores.cloningRepositoriesStore,
      stores.issuesStore,
      stats,
      stores.signInStore,
      stores.accountsStore,
      stores.repositoriesStore,
      coordinator,
      stores.repositoryStateCache,
      stores.apiRepositoriesStore,
      new NotificationsStore(
        stores.accountsStore,
        new AliveStore(stores.accountsStore),
        coordinator,
        stats,
        stores.repositoriesStore
      ),
      new CopilotStore(stores.accountsStore)
    )
    mock.method(appStore, '_showPopup', async () => {})
    mock.method(appStore, '_selectRepository', async () => null)
    await stores.accountsStore.addAccount(alice)
    await stores.accountsStore.addAccount(bob)
  })

  after(async () => {
    stores.repositoriesStore['emitter'].dispose()
    stores.accountsStore['emitter'].dispose()
    await setImmediate()
    statsDb?.close()
    mock.restoreAll()
  })

  async function setupRepository(t: TestContext) {
    const { setupEmptyRepository } = await import('../../helpers/repositories')
    const { addRemote } = await import('../../../src/lib/git')
    const repository = await setupEmptyRepository(t)
    await addRemote(repository, 'origin', apiRepository.clone_url)
    return repository
  }

  describe('preserving repository state across account changes', () => {
    async function setupDraft(t: TestContext) {
      const repository = await setupRepository(t)
      const added = await stores.repositoriesStore.addRepository(
        repository.path,
        repository.resolvedGitDir
      )
      const gitHubRepository =
        await stores.repositoriesStore.upsertGitHubRepositoryFromMatch({
          account: alice,
          owner: apiRepository.owner.login,
          name: apiRepository.name,
        })
      const assigned = await stores.repositoriesStore.setGitHubRepository(
        added,
        gitHubRepository,
        'alice'
      )
      // Like the AppStore's own changes, rather than waiting for the update.
      appStore['adoptRepository'](assigned)
      await appStore._setCommitMessage(assigned, {
        summary: 'Draft',
        description: null,
        timestamp: 1,
      })
      return assigned
    }

    function draftOf(repository: Repository) {
      return stores.repositoryStateCache.get(repository).changesState
        .commitMessage.summary
    }

    it('keeps the draft when the account changes', async t => {
      const repository = await setupDraft(t)
      const updated = await appStore._updateRepositoryAccount(repository, 'bob')
      assert.notStrictEqual(updated.hash, repository.hash)
      assert.strictEqual(draftOf(updated), 'Draft')
    })

    it('keeps the latest draft when switching back to a previous account', async t => {
      const alices = await setupDraft(t)
      const bobs = await appStore._updateRepositoryAccount(alices, 'bob')
      await appStore._setCommitMessage(bobs, {
        summary: 'Edited',
        description: null,
        timestamp: 2,
      })
      const back = await appStore._updateRepositoryAccount(bobs, 'alice')
      assert.strictEqual(back.hash, alices.hash)
      assert.strictEqual(draftOf(back), 'Edited')
      assert.strictEqual(
        appStore['gitStoreCache'].get(back).commitMessage.summary,
        'Edited'
      )
    })

    it('keeps the draft when refreshed metadata changes the repository', async t => {
      const repository = await setupDraft(t)
      t.mock.method(API, 'fromAccount', () =>
        createMockAPI({
          fetchRepository: async () => apiRepository,
          fetchProtectedBranches: async () => [],
        })
      )
      const refreshed = await appStore[
        'repositoryWithRefreshedGitHubRepository'
      ](repository)
      assert.notStrictEqual(refreshed.hash, repository.hash)
      assert.strictEqual(draftOf(refreshed), 'Draft')
    })
    it('keeps the draft when refreshing associates the repository anonymously', async t => {
      const { setupEmptyRepository } = await import(
        '../../helpers/repositories'
      )
      const { addRemote } = await import('../../../src/lib/git')
      const repository = await setupEmptyRepository(t)
      await addRemote(
        repository,
        'origin',
        'https://github.com/someone/drafted.git'
      )
      const added = await stores.repositoriesStore.addRepository(
        repository.path,
        repository.resolvedGitDir
      )
      await appStore._setCommitMessage(added, {
        summary: 'Draft',
        description: null,
        timestamp: 1,
      })
      t.mock.method(API, 'fromAccount', () =>
        createMockAPI({
          fetchRepository: async () => null,
          fetchProtectedBranches: async () => [],
        })
      )
      const refreshed = await appStore[
        'repositoryWithRefreshedGitHubRepository'
      ](added)
      assert.notStrictEqual(refreshed.gitHubRepository, null)
      assert.strictEqual(draftOf(refreshed), 'Draft')
    })

    it('keeps the draft when signing out clears the assignment', async t => {
      const repository = await setupDraft(t)
      t.mock.method(appStore, '_removeAccount', async () => {})
      t.mock.method(appStore, '_showPopup', async (popup: Popup) => {
        if (popup.type === PopupType.ConfirmAccountSignOut) {
          popup.onComplete(true)
        }
      })
      await appStore._signOutAccount(alice)
      const cleared = (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )
      assert.strictEqual(cleared?.login, null)
      assert.notStrictEqual(cleared.hash, repository.hash)
      assert.strictEqual(draftOf(cleared), 'Draft')
    })

    /** Run a network operation that finishes when the returned function is called. */
    function startNetworkOperation(repository: Repository) {
      let finish = () => {}
      const finished = new Promise<void>(resolve => (finish = resolve))
      const operation = appStore['withPushPullFetch'](
        repository,
        () => finished
      )
      return async () => {
        finish()
        await operation
      }
    }

    function isNetworkOperationInProgress(repository: Repository) {
      return stores.repositoryStateCache.get(repository)
        .isPushPullFetchInProgress
    }

    it('finishes a fetch that was running when the account changed', async t => {
      const repository = await setupDraft(t)
      const finish = startNetworkOperation(repository)
      const updated = await appStore._updateRepositoryAccount(repository, 'bob')
      assert.strictEqual(isNetworkOperationInProgress(updated), true)
      await appStore._setCommitMessage(updated, {
        summary: 'Edited',
        description: null,
        timestamp: 2,
      })

      await finish()

      assert.strictEqual(isNetworkOperationInProgress(updated), false)
      assert.strictEqual(draftOf(updated), 'Edited')
      let ran = false
      await appStore['withPushPullFetch'](updated, async () => {
        ran = true
      })
      assert.strictEqual(ran, true)
    })

    it('finishes a fetch that was running when metadata was refreshed', async t => {
      const repository = await setupDraft(t)
      t.mock.method(API, 'fromAccount', () =>
        createMockAPI({
          fetchRepository: async () => ({
            ...apiRepository,
            permissions: { pull: true, push: false, admin: false },
          }),
          fetchProtectedBranches: async () => [],
        })
      )
      const finish = startNetworkOperation(repository)
      const refreshed = await appStore[
        'repositoryWithRefreshedGitHubRepository'
      ](repository)
      assert.notStrictEqual(refreshed.hash, repository.hash)

      await finish()

      assert.strictEqual(isNetworkOperationInProgress(refreshed), false)
    })

    it('finishes a fetch that was running when the repository was associated anonymously', async t => {
      const { setupEmptyRepository } = await import(
        '../../helpers/repositories'
      )
      const { addRemote } = await import('../../../src/lib/git')
      const repository = await setupEmptyRepository(t)
      await addRemote(
        repository,
        'origin',
        'https://github.com/someone/fetching.git'
      )
      const added = await stores.repositoriesStore.addRepository(
        repository.path,
        repository.resolvedGitDir
      )
      t.mock.method(API, 'fromAccount', () =>
        createMockAPI({
          fetchRepository: async () => null,
          fetchProtectedBranches: async () => [],
        })
      )
      const finish = startNetworkOperation(added)
      const refreshed = await appStore[
        'repositoryWithRefreshedGitHubRepository'
      ](added)
      assert.notStrictEqual(refreshed.gitHubRepository, null)

      await finish()

      assert.strictEqual(isNetworkOperationInProgress(refreshed), false)
    })

    it('finishes a commit that was running when the account changed', async t => {
      const repository = await setupDraft(t)
      let finish = () => {}
      const commit = appStore['withIsCommitting'](
        repository,
        () => new Promise<boolean>(resolve => (finish = () => resolve(true)))
      )
      const updated = await appStore._updateRepositoryAccount(repository, 'bob')

      finish()
      await commit

      assert.strictEqual(
        stores.repositoryStateCache.get(updated).isCommitting,
        false
      )
    })

    it('uses the new account for operations started before it changed', async t => {
      const repository = await setupDraft(t)
      const gitStore = appStore['gitStoreCache'].get(repository)
      const updated = await appStore._updateRepositoryAccount(repository, 'bob')
      assert.strictEqual(appStore['gitStoreCache'].get(repository), gitStore)
      assert.strictEqual(gitStore.repository.login, 'bob')
      assert.strictEqual(gitStore.repository.hash, updated.hash)
    })

    it('keeps the new account when an update started with the previous one finishes', async t => {
      const repository = await setupDraft(t)
      const gitStore = appStore['gitStoreCache'].get(repository)
      await appStore._updateRepositoryAccount(repository, 'bob')

      const updated = await appStore._updateRepositoryMissing(repository, false)

      assert.strictEqual(updated.login, 'bob')
      assert.strictEqual(gitStore.repository.login, 'bob')
      assert.strictEqual(appStore['isCurrentAssociation'](updated), true)
    })

    it('reports progress for the selected repository after its account changed', async t => {
      const repository = await setupDraft(t)
      const updated = await appStore._updateRepositoryAccount(repository, 'bob')
      const selectedRepository = appStore['selectedRepository']
      t.after(() => (appStore['selectedRepository'] = selectedRepository))
      appStore['selectedRepository'] = updated
      const emitUpdate = appStore['emitUpdate']
      t.after(() => (appStore['emitUpdate'] = emitUpdate))
      let emitted = 0
      appStore['emitUpdate'] = () => emitted++

      appStore['updateRevertProgress'](repository, null)
      appStore['updatePushPullFetchProgress'](repository, null)

      assert.strictEqual(emitted, 2)
    })

    it('discards pull requests and protection loaded with the previous account', async t => {
      const repository = await setupDraft(t)
      const { PullRequest, PullRequestRef } = await import(
        '../../../src/models/pull-request'
      )
      assert(isRepositoryWithGitHubRepository(repository))
      const ref = new PullRequestRef(
        'feature',
        'head',
        repository.gitHubRepository
      )
      const pullRequest = new PullRequest(
        new Date(),
        'Example',
        42,
        ref,
        ref,
        'alice',
        false,
        ''
      )
      t.mock.method(
        appStore['gitStoreCache'].get(repository),
        'pruneForkedRemotes',
        async () => {}
      )
      const pullRequestsOf = (r: Repository) =>
        stores.repositoryStateCache.get(r).branchesState.openPullRequests
      await appStore['onPullRequestChanged'](repository, [pullRequest])
      stores.repositoryStateCache.updateChangesState(repository, () => ({
        currentBranchProtected: true,
      }))
      assert.strictEqual(pullRequestsOf(repository).length, 1)

      const updated = await appStore._updateRepositoryAccount(repository, 'bob')

      assert.strictEqual(pullRequestsOf(updated).length, 0)
      assert.strictEqual(
        stores.repositoryStateCache.get(updated).changesState
          .currentBranchProtected,
        false
      )
      await appStore['onPullRequestChanged'](repository, [pullRequest])
      assert.strictEqual(pullRequestsOf(updated).length, 0)
      const fromAccount = t.mock.method(API, 'fromAccount', () =>
        createMockAPI({})
      )
      await appStore['refreshBranchProtectionState'](repository)
      assert.strictEqual(fromAccount.mock.callCount(), 0)

      await appStore['onPullRequestChanged'](updated, [pullRequest])
      assert.strictEqual(pullRequestsOf(updated).length, 1)
    })

    describe('worktrees', () => {
      async function setupWorktree(t: TestContext) {
        const { setupEmptyRepository } = await import(
          '../../helpers/repositories'
        )
        const { createTempDirectory } = await import('../../helpers/temp')
        const { makeCommit } = await import(
          '../../helpers/repository-scaffolding'
        )
        const { addWorktree } = await import('../../../src/lib/git/worktree')
        const main = await setupEmptyRepository(t)
        await makeCommit(main, {
          entries: [{ path: 'README.md', contents: 'Hello' }],
        })
        const worktreePath = Path.join(await createTempDirectory(t), 'wt')
        await addWorktree(main, worktreePath, { createBranch: 'wt' })
        const added = await stores.repositoriesStore.addRepository(
          worktreePath,
          main.resolvedGitDir
        )
        await appStore._setCommitMessage(added, {
          summary: 'Draft',
          description: null,
          timestamp: 1,
        })
        return { added, main, worktreePath }
      }

      it('keeps the state of worktrees sharing a repository separate', async t => {
        const { added, main } = await setupWorktree(t)
        const other = new Repository(main.path, added.id, null, false)
        assert.strictEqual(draftOf(other), '')
        assert.notStrictEqual(
          appStore['gitStoreCache'].get(other),
          appStore['gitStoreCache'].get(added)
        )
      })

      it('uses the current account after switching back to a worktree', async t => {
        const { main } = await setupWorktree(t)
        const { listWorktrees } = await import('../../../src/lib/git/worktree')
        const { realpath } = await import('fs/promises')
        const mainPath = await realpath(main.path)
        const worktrees = await listWorktrees(main)
        const mainEntry = worktrees.find(wt => wt.type === 'main')
        const otherEntry = worktrees.find(wt => wt.type !== 'main')
        assert(mainEntry !== undefined && otherEntry !== undefined)

        const added = await stores.repositoriesStore.addRepository(
          mainPath,
          main.resolvedGitDir
        )
        const gitHubRepository =
          await stores.repositoriesStore.upsertGitHubRepositoryFromMatch({
            account: alice,
            owner: apiRepository.owner.login,
            name: apiRepository.name,
          })
        const alices = await stores.repositoriesStore.setGitHubRepository(
          added,
          gitHubRepository,
          'alice'
        )
        appStore['adoptRepository'](alices)
        const mainStore = appStore['gitStoreCache'].get(alices)

        const switched = await appStore._switchWorktree(alices, otherEntry)
        const bobs = await appStore._updateRepositoryAccount(switched, 'bob')
        const back = await appStore._switchWorktree(bobs, mainEntry)

        assert.strictEqual(back.login, 'bob')
        assert.strictEqual(appStore['gitStoreCache'].get(back), mainStore)
        assert.strictEqual(mainStore.repository.login, 'bob')
      })

      it('refuses to rename the worktree while a fetch is running', async t => {
        const { added, worktreePath } = await setupWorktree(t)
        const newPath = `${worktreePath}-renamed`
        const finish = startNetworkOperation(added)
        await assert.rejects(
          appStore._moveWorktree(added, worktreePath, newPath)
        )
        await finish()
        assert.strictEqual(existsSync(worktreePath), true)
      })

      // TODO: Renaming the current worktree fails on Windows because Git runs
      // inside the worktree being moved. Re-enable once that is fixed.
      const skipOnWindows = { skip: __WIN32__ }

      it(
        'does not start a fetch while the worktree is being renamed',
        skipOnWindows,
        async t => {
          const { added, worktreePath } = await setupWorktree(t)
          const move = appStore._moveWorktree(
            added,
            worktreePath,
            `${worktreePath}-renamed`
          )
          let ran = false
          await appStore['withPushPullFetch'](added, async () => {
            ran = true
          })
          await move

          assert.strictEqual(ran, false)
          const moved = (await stores.repositoriesStore.getAll()).find(
            r => r.id === added.id
          )
          assert(moved !== undefined)
          assert.strictEqual(isNetworkOperationInProgress(moved), false)
        }
      )

      it(
        'keeps the state and GitStore when renaming the worktree',
        skipOnWindows,
        async t => {
          const { added, worktreePath } = await setupWorktree(t)
          const gitStore = appStore['gitStoreCache'].get(added)
          const newPath = `${worktreePath}-renamed`

          await appStore._moveWorktree(added, worktreePath, newPath)

          const moved = (await stores.repositoriesStore.getAll()).find(
            r => r.id === added.id
          )
          assert(moved !== undefined)
          assert.strictEqual(moved.path, newPath)
          assert.strictEqual(draftOf(moved), 'Draft')
          assert.strictEqual(appStore['gitStoreCache'].get(moved), gitStore)
          assert.strictEqual(gitStore.repository.path, newPath)
        }
      )
    })
  })

  it('pushes a published repository with its new account', async t => {
    const { setupEmptyRepository } = await import('../../helpers/repositories')
    const { makeCommit } = await import('../../helpers/repository-scaffolding')
    const local = await setupEmptyRepository(t)
    await makeCommit(local, {
      entries: [{ path: 'README.md', contents: 'Hello' }],
    })
    const added = await stores.repositoriesStore.addRepository(
      local.path,
      local.resolvedGitDir
    )
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        createRepository: async () => apiRepository,
        fetchRepository: async () => apiRepository,
        fetchProtectedBranches: async () => [],
      })
    )
    t.mock.method(appStore, '_initializeCompare', async () => {})
    const performPush = appStore['performPush']
    const refreshBranchProtectionState =
      appStore['refreshBranchProtectionState']
    t.after(() => {
      appStore['performPush'] = performPush
      appStore['refreshBranchProtectionState'] = refreshBranchProtectionState
    })
    appStore['refreshBranchProtectionState'] = async () => {}
    const pushed = new Array<Repository>()
    appStore['performPush'] = async (repository: Repository) => {
      // The real push opens Publish again if it finds no remote.
      const { remote } = stores.repositoryStateCache.get(repository)
      assert.strictEqual(remote?.url, apiRepository.clone_url)
      pushed.push(repository)
    }
    // Like a selected repository, its current identity already has state.
    await appStore._refreshRepository(added)
    await appStore._publishRepository(added, 'repo', '', false, bob, null)
    assert.strictEqual(pushed.length, 1)
    assert.strictEqual(pushed[0].login, 'bob')
  })

  it('confirms an unfamiliar Enterprise Server before signing in for Git', async t => {
    const showPopup = t.mock.method(appStore, '_showPopup', async () => {})
    const { GitHubRepository } = await import(
      '../../../src/models/github-repository'
    )
    const { Owner } = await import('../../../src/models/owner')
    const { SignInStep } = await import('../../../src/lib/stores/sign-in-store')
    const enterprise = 'https://enterprise.example.com/api/v3'
    const repository = new Repository(
      '/enterprise',
      -1,
      new GitHubRepository('repo', new Owner('owner', enterprise, -1), -1),
      false
    )
    assert.ok(isRepositoryWithGitHubRepository(repository))

    const result = appStore['promptForUnassignedRepositoryAccount'](repository)
    for (let i = 0; i < 100 && showPopup.mock.callCount() === 0; i++) {
      await setImmediate()
    }

    const state = stores.signInStore.getState()
    assert.ok(state?.kind === SignInStep.Authentication)
    assert.strictEqual(state.endpoint, enterprise)
    assert.strictEqual(state.isUnrecognizedEnterpriseServer, true)
    assert.deepStrictEqual(showPopup.mock.calls[0].arguments, [
      { type: PopupType.SignIn },
    ])

    stores.signInStore.reset()
    assert.strictEqual(await result, undefined)
  })

  it('adds a tutorial with scoped permissions without a post-add account rebind', async t => {
    const repository = await setupRepository(t)
    t.mock.method(
      stores.repositoriesStore,
      'updateRepositoryAccount',
      async () =>
        assert.fail('Tutorial creation must persist its assignment atomically')
    )

    await appStore._addTutorialRepository(
      repository.path,
      endpoint,
      apiRepository,
      bob
    )

    const tutorial = (await stores.repositoriesStore.getAll()).find(
      candidate => candidate.path === repository.path
    )
    assert.ok(tutorial)
    assert.strictEqual(tutorial.login, 'bob')
    assert.strictEqual(tutorial.isTutorialRepository, true)
    assert.strictEqual(tutorial.gitHubRepository?.permissions, 'write')
  })

  it('assigns the only accessible account when adding a local repository', async t => {
    const repository = await setupRepository(t)
    const tokens: string[] = []
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepositoryIfAccessible: async () => {
          tokens.push(account.token)
          return account.login === bob.login ? apiRepository : null
        },
      })
    )
    t.mock.method(appStore, '_chooseRepositoryAccount', async () =>
      assert.fail('Only one account can access this repository')
    )
    const { gitHubRepositories } = stores.repositoriesStore['db']
    const existingIDs = new Set(await gitHubRepositories.toCollection().keys())
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, 'bob')
    assert.strictEqual(added[0].gitHubRepository?.permissions, 'write')
    const created = (await gitHubRepositories.toArray()).filter(
      r => !existingIDs.has(r.id ?? -1)
    )
    assert.deepStrictEqual(
      created.filter(r => r.accountLogin === ''),
      []
    )
    assert.deepStrictEqual(tokens.sort(), ['alice-token', 'bob-token'])
    assert.strictEqual(
      (await stores.repositoriesStore.getAll()).find(
        repo => repo.id === added[0].id
      )?.login,
      'bob'
    )
  })

  it('persists the explicit selection when multiple accounts have access', async t => {
    const repository = await setupRepository(t)
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepositoryIfAccessible: async () => apiRepository })
    )
    const chooser = t.mock.method(
      appStore,
      '_chooseRepositoryAccount',
      async (
        temporaryRepository: RepositoryWithGitHubRepository,
        accounts?: ReadonlyArray<Account>
      ) => {
        assert.strictEqual(temporaryRepository.id, -1)
        assert.deepStrictEqual(accounts, [alice, bob])
        return bob
      }
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, 'bob')
    assert.strictEqual(added[0].gitHubRepository?.permissions, 'write')
    assert.strictEqual(chooser.mock.callCount(), 1)
  })

  it('keeps an inaccessible repository unassigned', async t => {
    const repository = await setupRepository(t)
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepositoryIfAccessible: async () => null })
    )
    const { gitHubRepositories } = stores.repositoriesStore['db']
    const existingIDs = new Set(await gitHubRepositories.toCollection().keys())
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, null)
    assert.strictEqual(added[0].gitHubRepository?.endpoint, endpoint)
    const created = (await gitHubRepositories.toArray()).filter(
      r => !existingIDs.has(r.id ?? -1)
    )
    assert.deepStrictEqual(
      created.map(r => r.accountLogin),
      ['']
    )
  })

  it('skips accounts whose access check fails when adding a repository', async t => {
    const repository = await setupRepository(t)
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepositoryIfAccessible: async () => {
          if (account.login === alice.login) {
            throw new Error('Resource protected by organization SAML')
          }
          return apiRepository
        },
      })
    )
    t.mock.method(appStore, '_chooseRepositoryAccount', async () =>
      assert.fail('Only one account could be checked')
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, 'bob')
  })

  it('adds the repository unassigned when no account can be checked', async t => {
    const repository = await setupRepository(t)
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        fetchRepositoryIfAccessible: async () => {
          throw new Error('Network error')
        },
      })
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added.length, 1)
    assert.strictEqual(added[0].login, null)
    assert.strictEqual(added[0].gitHubRepository?.endpoint, endpoint)
  })

  it('does not probe or reassign an existing explicitly unassigned repository', async t => {
    const repository = await setupRepository(t)
    const existing = await stores.repositoriesStore.addRepository(
      repository.path,
      repository.resolvedGitDir
    )
    t.mock.method(API, 'fromAccount', () =>
      assert.fail('Adding an existing repository must not probe accounts')
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].id, existing.id)
    assert.strictEqual(added[0].login, null)
  })

  it('assigns the account selected for a clone before its metadata is known', async t => {
    const repository = await setupRepository(t)
    t.mock.method(
      stores.cloningRepositoriesStore,
      'takeCompletedAssignment',
      () => ({ name: 'repo', owner: 'owner', account: bob })
    )
    t.mock.method(API, 'fromAccount', () =>
      assert.fail('The account was chosen in the clone dialog')
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, 'bob')
    assert.strictEqual(added[0].gitHubRepository?.endpoint, endpoint)
    assert.strictEqual(added[0].gitHubRepository?.fullName, 'owner/repo')
    assert.strictEqual(
      (await stores.repositoriesStore.getAll()).find(
        repo => repo.id === added[0].id
      )?.login,
      'bob'
    )
  })

  it('preserves the account selected during clone without prompting again', async t => {
    const repository = await setupRepository(t)
    t.mock.method(
      stores.cloningRepositoriesStore,
      'takeCompletedAssignment',
      () => ({
        name: 'repo',
        owner: 'owner',
        account: bob,
        apiRepository,
      })
    )
    t.mock.method(API, 'fromAccount', () =>
      assert.fail('The clone already verified this account')
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, 'bob')
    assert.strictEqual(added[0].gitHubRepository?.permissions, 'write')
  })

  describe('cloning with an explicitly selected account', () => {
    async function chooseForClone(t: TestContext, login: string) {
      t.mock.method(API, 'fromAccount', () =>
        assert.fail('The selected account must be used without probing')
      )
      t.mock.method(appStore, '_chooseRepositoryAccount', async () =>
        assert.fail('The selected account must be used without prompting')
      )
      let choose: (() => Promise<unknown>) | undefined
      t.mock.method(
        stores.cloningRepositoriesStore,
        'clone',
        async (
          _url: string,
          _path: string,
          _options: unknown,
          chooseAccount: () => Promise<unknown>
        ) => {
          choose = chooseAccount
          return true
        }
      )
      appStore._clone('https://github.com/owner/repo', '/clone', {
        account: { endpoint, login },
      })
      assert.ok(choose)
      return choose()
    }

    it('assigns the selected account without probing for access', async t => {
      assert.deepStrictEqual(await chooseForClone(t, 'BOB'), {
        name: 'repo',
        owner: 'owner',
        account: bob,
      })
    })

    it('assigns nothing when the selected account is no longer signed in', async t => {
      assert.strictEqual(await chooseForClone(t, 'carol'), null)
    })
  })

  it('assigns a published repository even if it was associated meanwhile', async t => {
    const { setupEmptyRepository } = await import('../../helpers/repositories')
    const local = await setupEmptyRepository(t)
    const stale = await stores.repositoriesStore.addRepository(
      local.path,
      local.resolvedGitDir
    )
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({
        createRepository: async () => {
          const anonymous =
            await stores.repositoriesStore.upsertGitHubRepository(
              endpoint,
              apiRepository
            )
          await stores.repositoriesStore.setGitHubRepository(stale, anonymous)
          return apiRepository
        },
        fetchRepository: async () => apiRepository,
        fetchProtectedBranches: async () => [],
      })
    )
    const published = await appStore._publishRepository(
      stale,
      'repo',
      '',
      false,
      bob,
      null
    )
    assert.strictEqual(published.login, 'bob')
  })

  describe('associating a remote on a non-default port when refreshing', () => {
    const ported = 'https://ghe.example.com:8443/api/v3'

    async function refreshWithRemote(t: TestContext, url: string) {
      const { setupEmptyRepository } = await import(
        '../../helpers/repositories'
      )
      const { addRemote } = await import('../../../src/lib/git')
      const repository = await setupEmptyRepository(t)
      await addRemote(repository, 'origin', url)
      const added = await stores.repositoriesStore.addRepository(
        repository.path,
        repository.resolvedGitDir
      )
      const accounts = appStore['accounts']
      appStore['accounts'] = [
        ...accounts,
        new Account('carol', ported, 'carol-token', [], '', 3, ''),
      ]
      t.after(() => {
        appStore['accounts'] = accounts
      })
      t.mock.method(API, 'fromAccount', () =>
        createMockAPI({
          fetchRepository: async () => null,
          fetchProtectedBranches: async () => [],
        })
      )
      return appStore['repositoryWithRefreshedGitHubRepository'](added)
    }

    it('associates an HTTPS remote with the account on that port', async t => {
      const refreshed = await refreshWithRemote(
        t,
        'https://ghe.example.com:8443/owner/repo.git'
      )
      assert.strictEqual(refreshed.gitHubRepository?.endpoint, ported)
    })

    it('associates an SSH remote with the account on that host', async t => {
      const refreshed = await refreshWithRemote(
        t,
        'git@ghe.example.com:owner/repo.git'
      )
      assert.strictEqual(refreshed.gitHubRepository?.endpoint, ported)
    })
  })

  describe('associating a repository when Git asks for credentials', () => {
    async function addUnassociated(t: TestContext) {
      const repository = await setupRepository(t)
      return stores.repositoriesStore.addRepository(
        repository.path,
        repository.resolvedGitDir
      )
    }

    it('associates the default remote with the requested endpoint', async t => {
      const added = await addUnassociated(t)
      const updated = await appStore._associateRepositoryWithEndpoint(
        added,
        endpoint
      )
      assert.strictEqual(updated.login, null)
      assert.strictEqual(updated.gitHubRepository?.endpoint, endpoint)
      assert.strictEqual(updated.gitHubRepository?.fullName, 'owner/repo')
    })

    it('associates a remote on a non-default port with that endpoint', async t => {
      const { setupEmptyRepository } = await import(
        '../../helpers/repositories'
      )
      const { addRemote } = await import('../../../src/lib/git')
      const repository = await setupEmptyRepository(t)
      await addRemote(
        repository,
        'origin',
        'https://ghe.example.com:8443/owner/repo.git'
      )
      const added = await stores.repositoriesStore.addRepository(
        repository.path,
        repository.resolvedGitDir
      )
      const ported = 'https://ghe.example.com:8443/api/v3'
      assert.strictEqual(
        (
          await appStore._associateRepositoryWithEndpoint(
            added,
            'https://ghe.example.com/api/v3'
          )
        ).gitHubRepository,
        null
      )
      const updated = await appStore._associateRepositoryWithEndpoint(
        added,
        ported
      )
      assert.strictEqual(updated.gitHubRepository?.endpoint, ported)
    })

    it('leaves the repository alone for another endpoint', async t => {
      const added = await addUnassociated(t)
      const updated = await appStore._associateRepositoryWithEndpoint(
        added,
        'https://enterprise.example.com/api/v3'
      )
      assert.strictEqual(updated.gitHubRepository, null)
    })
  })

  describe('cloning a missing repository again', () => {
    async function cloneAgain(t: TestContext, login: string | null) {
      const { GitHubRepository } = await import(
        '../../../src/models/github-repository'
      )
      const { Owner } = await import('../../../src/models/owner')
      const missing = new Repository(
        '/missing',
        4242,
        new GitHubRepository('repo', new Owner('owner', endpoint, -1), -1),
        true,
        null,
        {},
        false,
        undefined,
        undefined,
        login
      )
      const previous = appStore['repositories']
      appStore['repositories'] = [missing]
      t.after(() => {
        appStore['repositories'] = previous
      })
      const ensure = t.mock.method(
        appStore,
        '_ensureRepositoryAccount',
        async () => alice
      )
      const clone = t.mock.method(appStore, '_clone', () => ({
        promise: Promise.resolve(false),
        repository: {},
      }))
      await appStore._cloneAgain('https://github.com/owner/repo', '/missing')
      return { ensure, options: clone.mock.calls[0]?.arguments[2] }
    }

    it('clones with the assigned account without discovering another', async t => {
      const { ensure, options } = await cloneAgain(t, 'alice')
      assert.strictEqual(ensure.mock.callCount(), 1)
      assert.deepStrictEqual(options, { account: { endpoint, login: 'alice' } })
    })

    it('discovers an account for an unassigned repository', async t => {
      const { ensure, options } = await cloneAgain(t, null)
      assert.strictEqual(ensure.mock.callCount(), 0)
      assert.deepStrictEqual(options, {})
    })
  })

  for (const fork of [false, true]) {
    it(`uses the existing ${
      fork ? 'fork parent' : 'repository'
    } assignment to fetch a PR URL`, async t => {
      const name = fork ? 'pr-parent' : 'pr-direct'
      const target = createMockAPIRepository({
        name,
        owner: { ...apiRepository.owner, login: 'owner' },
        clone_url: `https://github.com/owner/${name}.git`,
        html_url: `https://github.com/owner/${name}`,
      })
      const gh = await stores.repositoriesStore.upsertGitHubRepository(
        endpoint,
        fork
          ? {
              ...createMockAPIRepository({ name: 'local-fork', fork: true }),
              parent: target,
            }
          : { ...target, parent: undefined }
      )
      const repository = await stores.repositoriesStore.setGitHubRepository(
        await stores.repositoriesStore.addRepository(
          `/local-${name}`,
          undefined
        ),
        gh
      )
      await stores.repositoriesStore.updateRepositoryAccount(repository, 'bob')
      const requests: string[][] = []
      t.mock.method(API, 'fromAccount', (account: Account) =>
        createMockAPI({
          fetchPullRequest: async (owner, repositoryName, pr) => {
            requests.push([account.token, owner, repositoryName, pr])
            return apiPullRequest
          },
        })
      )
      t.mock.method(appStore, '_chooseRepositoryAccount', async () =>
        assert.fail(
          'An existing assigned repository must not choose another account'
        )
      )

      assert.strictEqual(
        await appStore.fetchPullRequest(target.clone_url, '42'),
        apiPullRequest
      )

      assert.deepStrictEqual(requests, [['bob-token', 'owner', name, '42']])
    })
  }

  it('does not probe alternatives when an existing unassigned repository prompt is canceled', async t => {
    const gh = await stores.repositoriesStore.upsertGitHubRepository(endpoint, {
      ...createMockAPIRepository({
        name: 'pr-unassigned',
        owner: { ...apiRepository.owner, login: 'owner' },
      }),
      parent: undefined,
    })
    const repository = await stores.repositoriesStore.setGitHubRepository(
      await stores.repositoriesStore.addRepository(
        '/local-unassigned-pr',
        undefined
      ),
      gh
    )
    const ensure = t.mock.method(
      appStore,
      '_ensureRepositoryAccount',
      async () => undefined
    )
    t.mock.method(API, 'fromAccount', () =>
      assert.fail('Canceled account selection must not fall back')
    )

    assert.strictEqual(
      await appStore.fetchPullRequest(
        'https://github.com/owner/pr-unassigned',
        '1'
      ),
      null
    )
    assert.strictEqual(ensure.mock.callCount(), 1)
    assert.strictEqual(ensure.mock.calls[0].arguments[0]?.id, repository.id)
  })

  it('probes and explicitly selects an account before fetching an untracked PR URL', async t => {
    const probes: string[] = []
    const requests: string[] = []
    t.mock.method(API, 'fromAccount', (account: Account) =>
      createMockAPI({
        fetchRepositoryIfAccessible: async () => {
          probes.push(account.token)
          return apiRepository
        },
        fetchPullRequest: async () => {
          requests.push(account.token)
          return apiPullRequest
        },
      })
    )
    const chooser = t.mock.method(
      appStore,
      '_chooseRepositoryAccount',
      async () => bob
    )

    await appStore.fetchPullRequest(
      'https://github.com/owner/pr-not-cloned',
      '1'
    )

    assert.deepStrictEqual(probes.sort(), ['alice-token', 'bob-token'])
    assert.deepStrictEqual(requests, ['bob-token'])
    assert.strictEqual(chooser.mock.callCount(), 1)
    assert.strictEqual(chooser.mock.calls[0].arguments[0]?.id, -1)
  })

  it('does not fetch an untracked PR when no account can access the repository', async t => {
    t.mock.method(API, 'fromAccount', () =>
      createMockAPI({ fetchRepositoryIfAccessible: async () => null })
    )
    t.mock.method(appStore, '_chooseRepositoryAccount', async () =>
      assert.fail(
        'No verified account must not prompt for an arbitrary account'
      )
    )
    assert.strictEqual(
      await appStore.fetchPullRequest(
        'https://github.com/owner/pr-inaccessible',
        '1'
      ),
      null
    )
  })
})
