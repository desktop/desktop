import assert from 'node:assert'
import { after, before, describe, it, mock } from 'node:test'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { CloningRepository } from '../../../src/models/cloning-repository'
import { Repository } from '../../../src/models/repository'
import { Account } from '../../../src/models/account'
import { setupEmptyRepository } from '../../helpers/repositories'
import {
  setAuthoringMode,
  setManageExternalAppAuthors,
  setManagedAuthor,
} from '../../../src/lib/git/account-authorship'
import { getConfigValue } from '../../../src/lib/git/config'
import { gitHubRepoFixture } from '../../helpers/github-repo-builder'
import { Popup, PopupType } from '../../../src/models/popup'

describe('AppStore repository indicators', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase | undefined
  let restoreSend: (() => void) | undefined

  after(async () => {
    await new Promise<void>(resolve =>
      window.requestAnimationFrame(() => resolve())
    )
    restoreSend?.()
    statsDb?.close()
    mock.restoreAll()
  })

  before(async () => {
    const electron = await import('electron')
    const previousSend = electron.ipcRenderer.send
    electron.ipcRenderer.send = () => {}
    restoreSend = () => {
      electron.ipcRenderer.send = previousSend
    }
    mock.module('../../../src/ui/main-process-proxy', {
      namedExports: {
        ...(await import('../../../src/ui/main-process-proxy')),
        getAppMenu: () => {},
      },
    })
    const { AppStore } = await import('../../../src/lib/stores/app-store')
    const { AliveStore } = await import('../../../src/lib/stores/alive-store')
    const { CopilotStore } = await import(
      '../../../src/lib/stores/copilot-store'
    )
    const { NotificationsStore } = await import(
      '../../../src/lib/stores/notifications-store'
    )
    const { PullRequestCoordinator } = await import(
      '../../../src/lib/stores/pull-request-coordinator'
    )
    const { createTestStores } = await import(
      '../../helpers/app-store-test-harness'
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
    mock.method(window, 'addEventListener', () => {})

    const stores = createTestStores()
    statsDb = new TestStatsDatabase()
    await statsDb.reset()
    const statsStore = new StatsStore(
      statsDb,
      new TestActivityMonitor(),
      fakePost
    )
    const pullRequestCoordinator = new PullRequestCoordinator(
      stores.pullRequestStore,
      stores.repositoriesStore
    )
    const notificationsStore = new NotificationsStore(
      stores.accountsStore,
      new AliveStore(stores.accountsStore),
      pullRequestCoordinator,
      statsStore
    )
    appStore = new AppStore(
      stores.gitHubUserStore,
      stores.cloningRepositoriesStore,
      stores.issuesStore,
      statsStore,
      stores.signInStore,
      stores.accountsStore,
      stores.repositoriesStore,
      pullRequestCoordinator,
      stores.repositoryStateCache,
      stores.apiRepositoriesStore,
      notificationsStore,
      new CopilotStore(stores.accountsStore)
    )
  })

  it('excludes the selected repository when its instance has changed', () => {
    const repository = new Repository('/repositories/selected', 1, null, false)
    const updatedRepository = new Repository(
      repository.path,
      repository.id,
      null,
      false,
      'Updated alias'
    )
    const otherRepository = new Repository(
      '/repositories/other',
      2,
      null,
      false
    )
    appStore['repositories'] = [updatedRepository, otherRepository]
    appStore['selectedRepository'] = repository

    assert.notStrictEqual(repository, updatedRepository)
    assert.notStrictEqual(repository.hash, updatedRepository.hash)
    assert.deepStrictEqual(
      appStore['repositoryIndicatorUpdater']['getRepositories'](),
      [otherRepository]
    )
  })

  it('excludes the selected repository when its instance is unchanged', () => {
    const repository = new Repository('/repositories/selected', 1, null, false)
    appStore['repositories'] = [repository]
    appStore['selectedRepository'] = repository

    assert.deepStrictEqual(
      appStore['repositoryIndicatorUpdater']['getRepositories'](),
      []
    )
  })

  it('synchronizes and restores external authorship for every tracked repository', async t => {
    const account = new Account(
      'joan',
      'https://api.github.com',
      'token',
      [],
      '',
      123,
      ''
    )
    const repositories = await Promise.all([
      setupEmptyRepository(t),
      setupEmptyRepository(t),
    ])
    const associated = repositories.map(repo =>
      Object.assign(repo, {
        accountIdentity: { endpoint: account.endpoint, id: account.id },
      })
    )
    appStore['repositories'] = associated
    appStore['knownAccounts'] = [account]
    setManagedAuthor(account, {
      name: 'Managed Name',
      email: 'managed@example.com',
    })
    setAuthoringMode('desktop')
    setManageExternalAppAuthors(true)

    try {
      await appStore._synchronizeExternalAppAuthors()
      for (const repository of associated) {
        assert.strictEqual(
          await getConfigValue(repository, 'user.email', true),
          'managed@example.com'
        )
      }

      setManageExternalAppAuthors(false)
      await appStore._synchronizeExternalAppAuthors()
      for (const repository of associated) {
        assert.strictEqual(
          await getConfigValue(repository, 'user.email', true),
          null
        )
      }
    } finally {
      setManageExternalAppAuthors(false)
      localStorage.clear()
    }
  })

  it('asks for an account only on explicit pull-request refresh of an unassociated repository', async t => {
    const account = new Account(
      'joan',
      'https://api.github.com',
      'token',
      [],
      '',
      123,
      ''
    )
    const ghRepo = gitHubRepoFixture({ owner: 'team', name: 'repo' })
    const repository = new Repository(
      '/missing',
      1,
      ghRepo,
      false,
      null,
      {},
      false,
      undefined,
      undefined,
      null
    )
    appStore['accounts'] = [account]
    let popup: Popup | undefined
    let associatedAccount: Account | null = null
    t.mock.method(
      appStore,
      '_setRepositoryAccount',
      async (_repository: Repository, selected: Account | null) => {
        associatedAccount = selected
        return repository
      }
    )
    let refreshed = false
    t.mock.method(
      appStore['pullRequestCoordinator'],
      'refreshPullRequests',
      async () => {
        refreshed = true
      }
    )
    t.mock.method(appStore, '_showPopup', async (candidate: Popup) => {
      popup = candidate
    })

    await appStore._refreshPullRequests(repository)
    assert.strictEqual(popup?.type, PopupType.ChooseRepositoryAccount)
    if (popup?.type === PopupType.ChooseRepositoryAccount) {
      assert.deepStrictEqual(popup.accounts, [account])
      await popup.onSelected(account)
      assert.strictEqual(associatedAccount, account)
      assert.strictEqual(refreshed, true)
    }
  })

  it('lets an explicit pull-request refresh associate an unrecognized GitHub remote', async t => {
    const account = new Account(
      'joan',
      'https://api.github.com',
      'token',
      [],
      '',
      123,
      ''
    )
    const repository = await setupEmptyRepository(t)
    const { exec } = await import('dugite')
    await exec(
      ['remote', 'add', 'origin', 'https://github.com/team/repo.git'],
      repository.path
    )
    await appStore['gitStoreCache'].get(repository).loadRemotes()
    const unassociated = Object.assign(repository, { accountIdentity: null })
    appStore['accounts'] = [account]

    let popup: Popup | undefined
    let refreshed = false
    t.mock.method(appStore, '_showPopup', async (candidate: Popup) => {
      popup = candidate
    })
    t.mock.method(appStore, '_setRepositoryAccount', async () => unassociated)
    t.mock.method(
      Object.getPrototypeOf(appStore),
      'repositoryWithRefreshedGitHubRepository',
      async () =>
        Object.assign(unassociated, {
          gitHubRepository: gitHubRepoFixture({ owner: 'team', name: 'repo' }),
        })
    )
    t.mock.method(
      appStore['pullRequestCoordinator'],
      'refreshPullRequests',
      async () => {
        refreshed = true
      }
    )

    await appStore._refreshPullRequests(unassociated)
    assert.strictEqual(popup?.type, PopupType.ChooseRepositoryAccount)
    if (popup?.type === PopupType.ChooseRepositoryAccount) {
      await popup.onSelected(account)
      assert.strictEqual(refreshed, true)
    }
  })

  it('invalidates only the account whose API token was revoked', t => {
    const first = new Account(
      'joan',
      'https://api.github.com',
      'first-token',
      [],
      '',
      1,
      ''
    )
    const second = new Account(
      'alex',
      first.endpoint,
      'second-token',
      [],
      '',
      2,
      ''
    )
    appStore['accounts'] = [first, second]
    let removed: Account | undefined
    let popup: Popup | undefined
    t.mock.method(appStore, '_removeAccount', async (account: Account) => {
      removed = account
    })
    t.mock.method(appStore, '_showPopup', async (candidate: Popup) => {
      popup = candidate
    })

    appStore['onTokenInvalidated'](first.endpoint, second.token)

    assert.strictEqual(removed, second)
    assert.strictEqual(popup?.type, PopupType.InvalidatedToken)
    if (popup?.type === PopupType.InvalidatedToken) {
      assert.strictEqual(popup.account, second)
    }
  })

  it('returns a copy of all repositories when none is selected', () => {
    const repositories = [
      new Repository('/repositories/first', 1, null, false),
      new Repository('/repositories/second', 2, null, false),
    ]
    appStore['repositories'] = repositories
    appStore['selectedRepository'] = null

    const result = appStore['repositoryIndicatorUpdater']['getRepositories']()

    assert.deepStrictEqual(result, repositories)
    assert.notStrictEqual(result, repositories)
  })

  it('keeps local repositories when a cloning repository is selected', () => {
    const selectedRepository = new CloningRepository(
      '/repositories/cloning',
      'https://github.com/desktop/cloning.git'
    )
    const repositories = [
      new Repository('/repositories/local', selectedRepository.id, null, false),
    ]
    appStore['repositories'] = repositories
    appStore['selectedRepository'] = selectedRepository

    assert.deepStrictEqual(
      appStore['repositoryIndicatorUpdater']['getRepositories'](),
      repositories
    )
  })

  it('skips automatic repository management when the new account host has no tracked repositories', async t => {
    const account = new Account(
      'pat',
      'https://enterprise.example.com/api/v3',
      'token',
      [],
      '',
      501,
      ''
    )
    appStore['showWelcomeFlow'] = false
    appStore['repositories'] = [
      new Repository(
        '/repositories/dotcom',
        501,
        gitHubRepoFixture({ owner: 'team', name: 'dotcom' }),
        false
      ),
    ]
    t.mock.method(appStore['accountsStore'], 'addAccount', async () => account)
    let popup: Popup | undefined
    t.mock.method(appStore, '_showPopup', async (candidate: Popup) => {
      popup = candidate
    })

    await appStore['_addAccount'](account)

    assert.strictEqual(popup, undefined)
  })

  it('offers automatic management when the new account host has tracked repositories', async t => {
    const account = new Account(
      'joan',
      'https://api.github.com',
      'token',
      [],
      '',
      502,
      ''
    )
    appStore['showWelcomeFlow'] = false
    appStore['repositories'] = [
      new Repository(
        '/repositories/dotcom',
        502,
        gitHubRepoFixture({ owner: 'team', name: 'dotcom' }),
        false
      ),
    ]
    t.mock.method(appStore['accountsStore'], 'addAccount', async () => account)
    let popup: Popup | undefined
    t.mock.method(appStore, '_showPopup', async (candidate: Popup) => {
      popup = candidate
    })

    await appStore['_addAccount'](account)

    assert.strictEqual(popup?.type, PopupType.ManageAccountRepositories)
  })

  it('offers automatic management for a local repository with a matching cached remote', async t => {
    const account = new Account(
      'alex',
      'https://api.github.com',
      'token',
      [],
      '',
      503,
      ''
    )
    const repository = new Repository('/repositories/local', 503, null, false)
    const state = appStore['repositoryStateCache'].get(repository)
    appStore['showWelcomeFlow'] = false
    appStore['repositories'] = [repository]
    t.mock.method(appStore['accountsStore'], 'addAccount', async () => account)
    t.mock.method(appStore['repositoryStateCache'], 'get', () => ({
      ...state,
      remote: { name: 'origin', url: 'git@github.com:team/local.git' },
    }))
    let popup: Popup | undefined
    t.mock.method(appStore, '_showPopup', async (candidate: Popup) => {
      popup = candidate
    })

    await appStore['_addAccount'](account)

    assert.strictEqual(popup?.type, PopupType.ManageAccountRepositories)
  })
})
