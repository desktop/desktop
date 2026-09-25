import assert from 'node:assert/strict'
import { after, before, describe, it, mock, TestContext } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { AppStore } from '../../../src/lib/stores/app-store'
import { API, IAPIPullRequest } from '../../../src/lib/api'
import { Account } from '../../../src/models/account'
import { RepositoryWithGitHubRepository } from '../../../src/models/repository'
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
        fetchRepository: async () => {
          tokens.push(account.token)
          return account.login === bob.login ? apiRepository : null
        },
      })
    )
    t.mock.method(appStore, '_chooseRepositoryAccount', async () =>
      assert.fail('Only one account can access this repository')
    )
    const added = await appStore._addRepositories([repository.path])
    assert.strictEqual(added[0].login, 'bob')
    assert.strictEqual(added[0].gitHubRepository?.permissions, 'write')
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
      createMockAPI({ fetchRepository: async () => apiRepository })
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
      createMockAPI({ fetchRepository: async () => null })
    )
    const added = await appStore._addRepositories([repository.path])
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
        fetchRepository: async () => {
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
      createMockAPI({ fetchRepository: async () => null })
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
