import assert from 'node:assert/strict'
import { after, before, describe, it, mock } from 'node:test'
import type { TestContext } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { SignInResult } from '../../../src/lib/stores/sign-in-store'
import { Account } from '../../../src/models/account'
import { PopupType } from '../../../src/models/popup'
import type { Popup } from '../../../src/models/popup'
import { isRepositoryWithGitHubRepository } from '../../../src/models/repository'
import { createMockAPIRepository } from '../../helpers/mock-api'
import type { ITestStores } from '../../helpers/app-store-test-harness'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { exec } from 'dugite'

describe('AppStore repository accounts', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase
  let stores: ITestStores
  const endpoint = 'https://api.github.com'
  const alice = new Account(
    'alice',
    endpoint,
    'alice-token',
    [],
    '',
    1,
    'Alice'
  )
  const bob = new Account('bob', endpoint, 'bob-token', [], '', 2, 'Bob')
  const popups: Popup[] = []

  before(async () => {
    mock.module('../../../src/lib/api', {
      namedExports: {
        ...(await import('../../../src/lib/api')),
        deleteToken: async () => true,
      },
    })
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
    mock.method(appStore, '_showPopup', async (popup: Popup) => {
      popups.push(popup)
    })
    const popupManager = appStore['popupManager']
    const addPopup = popupManager.addPopup.bind(popupManager)
    mock.method(popupManager, 'addPopup', (popup: Popup) => {
      const added = addPopup(popup)
      popups.push(added)
      return added
    })
    mock.method(appStore, '_selectRepository', async () => null)
    await stores.accountsStore.getAll()
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

  async function addRepository(path: string, login: string | null) {
    const gh = await stores.repositoriesStore.upsertGitHubRepository(endpoint, {
      ...createMockAPIRepository(),
      parent: undefined,
    })
    const repo = await stores.repositoriesStore.setGitHubRepository(
      await stores.repositoriesStore.addRepository(path, undefined),
      gh
    )
    return stores.repositoriesStore.updateRepositoryAccount(repo, login)
  }

  async function nextPopup(type: PopupType) {
    for (let attempts = 0; attempts < 100; attempts++) {
      const popup = popups.find(p => p.type === type)
      if (popup !== undefined) {
        popups.splice(popups.indexOf(popup), 1)
        return popup
      }
      await setImmediate()
    }
    assert.fail(`No ${type} popup`)
  }

  it('deduplicates prompts and persists the selected account', async () => {
    const repository = await addRepository('/unassigned', null)
    const first = appStore._ensureRepositoryAccount(repository)
    const second = appStore._ensureRepositoryAccount(repository)
    const popup = await nextPopup(PopupType.RepositoryAccount)
    assert.equal(popup.type, PopupType.RepositoryAccount)
    if (popup.type !== PopupType.RepositoryAccount) {
      assert.fail('Expected account picker')
    }
    popup.onComplete(bob)
    appStore._closePopup(PopupType.RepositoryAccount)
    assert.equal((await first)?.login, 'bob')
    assert.equal((await second)?.login, 'bob')
    assert.equal(
      popups.filter(p => p.type === PopupType.RepositoryAccount).length,
      0
    )
    const persisted = (await stores.repositoriesStore.getAll()).find(
      r => r.id === repository.id
    )
    assert.equal(persisted?.login, 'bob')
  })

  describe('when the account picker closes without completing', () => {
    it('resolves the prompt when the picker is closed another way', async () => {
      const repository = await addRepository('/closed-picker', null)
      const prompt = appStore._ensureRepositoryAccount(repository)
      await nextPopup(PopupType.RepositoryAccount)
      appStore._closePopup()
      assert.equal(await prompt, undefined)

      const next = appStore._ensureRepositoryAccount(repository)
      const popup = await nextPopup(PopupType.RepositoryAccount)
      if (popup.type !== PopupType.RepositoryAccount) {
        assert.fail('Expected account picker')
      }
      popup.onComplete(alice)
      appStore._closePopup(PopupType.RepositoryAccount)
      assert.equal((await next)?.login, 'alice')
    })

    it('resolves the prompt when the picker is already open', async () => {
      const repository = await addRepository('/picker-open', null)
      if (!isRepositoryWithGitHubRepository(repository)) {
        assert.fail('Expected a GitHub repository')
      }
      const popupManager = appStore['popupManager']
      const existing = popupManager.addPopup({
        type: PopupType.RepositoryAccount,
        repository,
        onComplete: () => {},
      })
      try {
        assert.equal(
          await appStore._ensureRepositoryAccount(repository),
          undefined
        )
      } finally {
        if (existing.id !== undefined) {
          appStore._closePopupById(existing.id)
        }
        popups.length = 0
      }
    })
  })

  describe('when no account is signed in for the endpoint', () => {
    const gheEndpoint = 'https://api.company.ghe.com/'

    async function addGHERepository(path: string) {
      const gh = await stores.repositoriesStore.upsertGitHubRepository(
        gheEndpoint,
        { ...createMockAPIRepository(), parent: undefined }
      )
      return stores.repositoriesStore.setGitHubRepository(
        await stores.repositoriesStore.addRepository(path, undefined),
        gh
      )
    }

    function captureSignIn(t: TestContext) {
      const signIn: {
        endpoint?: string
        callback?: (result: SignInResult) => void
      } = {}
      t.mock.method(
        appStore,
        '_beginEnterpriseSignIn',
        (callback: (result: SignInResult) => void) => {
          signIn.callback = callback
        }
      )
      t.mock.method(appStore, '_setSignInEndpoint', async (url: string) => {
        signIn.endpoint = url
      })
      return signIn
    }

    it('shows sign-in instead of an empty account choice and saves the new account', async t => {
      const signIn = captureSignIn(t)
      const repository = await addGHERepository('/ghe-unassigned')
      const carol = new Account(
        'carol',
        gheEndpoint,
        'carol-token',
        [],
        '',
        3,
        'Carol'
      )
      const prompt = appStore._ensureRepositoryAccount(repository)

      await nextPopup(PopupType.SignIn)
      assert.equal(signIn.endpoint, 'https://company.ghe.com/')
      await stores.accountsStore.addAccount(carol)
      t.after(() => stores.accountsStore.removeAccount(carol))
      signIn.callback?.({ kind: 'success', account: carol })

      assert.equal((await prompt)?.login, 'carol')
      assert.deepEqual(
        popups.filter(p => p.type === PopupType.RepositoryAccount),
        []
      )
      const persisted = (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )
      assert.equal(persisted?.login, 'carol')
    })

    it('leaves the repository unassigned when sign-in is cancelled', async t => {
      const signIn = captureSignIn(t)
      const repository = await addGHERepository('/ghe-cancelled')
      const prompt = appStore._ensureRepositoryAccount(repository)

      await nextPopup(PopupType.SignIn)
      signIn.callback?.({ kind: 'cancelled' })

      assert.equal(await prompt, undefined)
      const persisted = (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )
      assert.equal(persisted?.login, null)
    })
  })

  it('keeps the stored login when reauthentication is cancelled', async () => {
    const repository = await addRepository('/signed-out', 'missing')
    const result = appStore._ensureRepositoryAccount(repository)
    const popup = await nextPopup(PopupType.RepositoryAccount)
    if (popup.type !== PopupType.RepositoryAccount) {
      assert.fail('Expected reauthentication prompt')
    }
    assert.equal(popup.repository.login, 'missing')
    popup.onComplete(undefined)
    appStore._closePopup(PopupType.RepositoryAccount)
    assert.equal(await result, undefined)
    assert.equal(
      (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )?.login,
      'missing'
    )
  })

  it('preserves assignments when an account is removed without interaction', async () => {
    const repository = await addRepository('/automatic-removal', 'alice')
    await appStore._removeAccount(alice)
    assert.equal(
      (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )?.login,
      'alice'
    )
    await stores.accountsStore.addAccount(alice)
  })

  it('offers keep or clear on explicit sign-out, and allows cancellation', async t => {
    const repository = await addRepository('/explicit-sign-out', 'alice')
    const removed = t.mock.method(appStore, '_removeAccount', async () => {})
    const cancelled = appStore._signOutAccount(alice)
    const cancelPopup = await nextPopup(PopupType.ConfirmAccountSignOut)
    if (cancelPopup.type !== PopupType.ConfirmAccountSignOut) {
      assert.fail('Expected sign-out confirmation')
    }
    assert.ok(cancelPopup.repositoryCount > 0)
    cancelPopup.onComplete(undefined)
    await cancelled
    assert.equal(removed.mock.callCount(), 0)

    const keep = appStore._signOutAccount(alice)
    const keepPopup = await nextPopup(PopupType.ConfirmAccountSignOut)
    if (keepPopup.type !== PopupType.ConfirmAccountSignOut) {
      assert.fail('Expected sign-out confirmation')
    }
    keepPopup.onComplete(false)
    await keep
    assert.equal(
      (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )?.login,
      'alice'
    )
    const clear = appStore._signOutAccount(alice)
    const clearPopup = await nextPopup(PopupType.ConfirmAccountSignOut)
    if (clearPopup.type !== PopupType.ConfirmAccountSignOut) {
      assert.fail('Expected sign-out confirmation')
    }
    clearPopup.onComplete(true)
    await clear
    assert.equal(
      (await stores.repositoriesStore.getAll()).find(
        r => r.id === repository.id
      )?.login,
      null
    )
    assert.equal(removed.mock.callCount(), 2)
  })

  it('signs out only the account whose token is rejected and keeps its assignments', async () => {
    const repository = await addRepository('/invalidated', 'bob')
    const popupCount = popups.length
    try {
      await stores.accountsStore.invalidateToken(endpoint, 'stale-token')
      assert.deepEqual(
        (await stores.accountsStore.getAll()).map(a => a.login).sort(),
        ['alice', 'bob']
      )

      await stores.accountsStore.invalidateToken(endpoint, bob.token)
      assert.deepEqual(
        (await stores.accountsStore.getAll()).map(a => a.login),
        ['alice']
      )
      assert.equal(
        (await stores.repositoriesStore.getAll()).find(
          r => r.id === repository.id
        )?.login,
        'bob'
      )
      const shown = popups.slice(popupCount)
      assert.equal(shown.length, 1)
      assert.equal(shown[0].type, PopupType.InvalidatedToken)
      assert.equal(
        shown[0].type === PopupType.InvalidatedToken && shown[0].account.login,
        'bob'
      )
    } finally {
      await stores.accountsStore.addAccount(bob)
    }
  })

  it('clears assignments and discovers the new endpoint when changing a remote', async t => {
    const { setupEmptyRepository } = await import('../../helpers/repositories')
    const local = await setupEmptyRepository(t)
    const repository = await addRepository(local.path, 'alice')
    const result = await exec(
      ['remote', 'add', 'origin', 'https://github.com/owner/repo.git'],
      local.path
    )
    assert.equal(result.exitCode, 0)
    await appStore['gitStoreCache'].get(repository).loadRemotes()
    await appStore._setRemoteURL(
      repository,
      'origin',
      'https://company.ghe.com/owner/repo.git'
    )
    const updated = (await stores.repositoriesStore.getAll()).find(
      r => r.id === repository.id
    )
    assert.equal(updated?.login, null)
    assert.equal(
      updated?.gitHubRepository?.endpoint,
      'https://api.company.ghe.com/'
    )
  })

  for (const [description, login, fetchType] of [
    ['an unassigned repository', null, 'user'],
    ['a signed-out assigned account', 'carol', 'user'],
    ['an unassigned repository in the background', null, 'background'],
  ] as const) {
    it(`fetches ${description} without asking for an account when Git needs no credentials`, async t => {
      const { setupEmptyRepository } = await import(
        '../../helpers/repositories'
      )
      const { makeCommit } = await import(
        '../../helpers/repository-scaffolding'
      )
      const { FetchType } = await import('../../../src/models/fetch')
      const upstream = await setupEmptyRepository(t)
      await makeCommit(upstream, {
        commitMessage: 'first',
        entries: [{ path: 'README.md', contents: 'first' }],
      })
      const local = await setupEmptyRepository(t)
      const remote = await exec(
        ['remote', 'add', 'origin', upstream.path],
        local.path
      )
      assert.equal(remote.exitCode, 0)
      const repository = await addRepository(local.path, login)
      await appStore['gitStoreCache'].get(repository).loadRemotes()
      t.mock.method(appStore, '_refreshRepository', async () => {})
      // The local remote path never matches a GitHub repository, so keep the
      // repository as-is rather than clearing its association.
      const refresh = appStore['repositoryWithRefreshedGitHubRepository']
      appStore['repositoryWithRefreshedGitHubRepository'] = async r => r
      t.after(() => {
        appStore['repositoryWithRefreshedGitHubRepository'] = refresh
      })
      popups.length = 0

      await appStore._fetch(
        repository,
        fetchType === 'user'
          ? FetchType.UserInitiatedTask
          : FetchType.BackgroundTask
      )

      const refs = await exec(
        ['for-each-ref', '--format=%(refname)', 'refs/remotes/origin/'],
        local.path
      )
      assert.notEqual(
        refs.stdout.trim(),
        '',
        'Expected origin refs to be fetched'
      )
      assert.deepEqual(
        popups.filter(p => p.type === PopupType.RepositoryAccount),
        []
      )
    })
  }
})
