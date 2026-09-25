import assert from 'node:assert/strict'
import { after, before, describe, it, mock } from 'node:test'
import { setImmediate } from 'node:timers/promises'
import type { AppStore } from '../../../src/lib/stores/app-store'
import { Account } from '../../../src/models/account'
import { PopupType } from '../../../src/models/popup'
import type { Popup } from '../../../src/models/popup'
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

  it('keeps the stored login when reauthentication is cancelled', async () => {
    const repository = await addRepository('/signed-out', 'missing')
    const result = appStore._ensureRepositoryAccount(repository)
    const popup = await nextPopup(PopupType.RepositoryAccount)
    if (popup.type !== PopupType.RepositoryAccount) {
      assert.fail('Expected reauthentication prompt')
    }
    assert.equal(popup.repository.login, 'missing')
    popup.onComplete(undefined)
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

  it('invalidates the exact token rather than the first endpoint account', async t => {
    const removed = t.mock.method(
      appStore,
      '_removeAccount',
      async (_account: Account) => {}
    )
    appStore['onTokenInvalidated'](endpoint, bob.token)
    assert.equal(removed.mock.calls[0]?.arguments[0].login, 'bob')
    appStore['onTokenInvalidated'](endpoint, 'stale-token')
    assert.equal(removed.mock.callCount(), 1)
    assert.equal(popups.length, 0)
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
})
