import assert from 'node:assert/strict'
import { after, before, describe, it, mock } from 'node:test'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { AccountsStore } from '../../../src/lib/stores/accounts-store'
import type { StatsStore } from '../../../src/lib/stats'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { Account } from '../../../src/models/account'
import { OAuthRefreshRejectedError } from '../../../src/lib/oauth-token'

describe('AppStore token refresh usage stats wiring', () => {
  let appStore: AppStore
  let accountsStore: AccountsStore
  let statsStore: StatsStore
  let statsDb: TestStatsDatabase
  let rejectRenewal = false

  after(() => {
    statsDb?.close()
    mock.restoreAll()
  })

  before(async () => {
    mock.module('../../../src/ui/main-process-proxy', {
      namedExports: {
        ...(await import('../../../src/ui/main-process-proxy')),
        getAppMenu: () => {},
        updateAccounts: () => {},
      },
    })
    const { AppStore } = await import('../../../src/lib/stores/app-store')
    const { AccountsStore } = await import(
      '../../../src/lib/stores/accounts-store'
    )
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
    const { InMemoryStore, AsyncInMemoryStore } = await import(
      '../../helpers/stores'
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
    mock.method(window, 'requestAnimationFrame', () => 0)

    const stores = createTestStores()
    accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore(),
      async () => {
        if (rejectRenewal) {
          throw new OAuthRefreshRejectedError()
        }
        return {
          accessToken: 'renewed-access',
          refreshToken: 'renewed-refresh',
          expiresAt: Date.now() + 8 * 60 * 60_000,
        }
      }
    )
    statsDb = new TestStatsDatabase()
    await statsDb.reset()
    statsStore = new StatsStore(statsDb, new TestActivityMonitor(), fakePost)
    const coordinator = new PullRequestCoordinator(
      stores.pullRequestStore,
      stores.repositoriesStore
    )
    const notifications = new NotificationsStore(
      accountsStore,
      new AliveStore(accountsStore),
      coordinator,
      statsStore
    )
    appStore = new AppStore(
      stores.gitHubUserStore,
      stores.cloningRepositoriesStore,
      stores.issuesStore,
      statsStore,
      stores.signInStore,
      accountsStore,
      stores.repositoriesStore,
      coordinator,
      stores.repositoryStateCache,
      stores.apiRepositoriesStore,
      notifications,
      new CopilotStore(accountsStore)
    )
    // Account changes must not perform real authenticated background work here.
    appStore['updateCopilotModelsForCurrentAccount'] = () => {}
    appStore['updateCopilotQuotaSnapshotsForCurrentAccount'] = () => {}
    appStore['refreshSelectedRepositoryAfterAccountChange'] = async () => {}
    await accountsStore.getAll()
  })

  it('keeps adoption in sync across legacy sign-in, renewal, and required sign-out', async t => {
    const adoption = t.mock.method(statsStore, 'setUsesShortLivedToken')
    const record = t.mock.method(statsStore, 'recordTokenRefreshEvent')
    const legacy = new Account(
      'legacy',
      'https://api.github.com',
      'legacy-access',
      [],
      '',
      1,
      'Legacy'
    )
    await accountsStore.addAccount(legacy)
    assert.equal(adoption.mock.calls.at(-1)?.arguments[0], false)

    const enterprise = new Account(
      'mona',
      'https://api.mona.ghe.com',
      'old-access',
      [],
      '',
      2,
      'Mona'
    )
    const current = await accountsStore.addAccount(enterprise, {
      accessToken: enterprise.token,
      refreshToken: 'old-refresh',
      expiresAt: 0,
    })
    assert.equal(adoption.mock.calls.at(-1)?.arguments[0], true)
    assert.ok(current)
    await accountsStore.getAccountWithFreshToken(current)
    await Promise.all(record.mock.calls.map(call => call.result))
    assert.deepEqual(
      record.mock.calls.map(call => call.arguments[0]),
      ['attempt', 'success']
    )
    assert.equal(adoption.mock.calls.at(-1)?.arguments[0], true)
    assert.equal(
      (await statsDb.dailyMeasures.limit(1).first())?.tokenRefreshSuccessCount,
      1
    )

    rejectRenewal = true
    const replacement = await accountsStore.addAccount(enterprise, {
      accessToken: 'replacement-access',
      refreshToken: 'replacement-refresh',
      expiresAt: 0,
    })
    assert.ok(replacement)
    await assert.rejects(
      accountsStore.getAccountWithFreshToken(replacement),
      OAuthRefreshRejectedError
    )
    await Promise.all(record.mock.calls.map(call => call.result))
    assert.equal(adoption.mock.calls.at(-1)?.arguments[0], false)
    assert.deepEqual(
      record.mock.calls.map(call => call.arguments[0]),
      [
        'attempt',
        'success',
        'attempt',
        'non-transient-failure',
        'required-sign-in',
      ]
    )
    assert.equal(
      (await statsDb.dailyMeasures.limit(1).first())
        ?.tokenRefreshRequiredSignInCount,
      1
    )
    assert.deepEqual(
      (await accountsStore.getAll()).map(a => a.login),
      ['legacy']
    )
  })

  it('logs recording failures without breaking credential renewal', async t => {
    rejectRenewal = false
    const error = new Error('Stats database unavailable')
    const logger = t.mock.method(log, 'error')
    t.mock.method(statsStore, 'recordTokenRefreshEvent', async () => {
      throw error
    })
    const account = new Account(
      'octocat',
      'https://api.github.com',
      'old-access',
      [],
      '',
      3,
      'Octocat'
    )
    const current = await accountsStore.addAccount(account, {
      accessToken: account.token,
      refreshToken: 'old-refresh',
      expiresAt: 0,
    })
    assert.ok(current)
    assert.equal(
      (await accountsStore.getAccountWithFreshToken(current)).token,
      'renewed-access'
    )
    assert.ok(logger.mock.calls.some(call => call.arguments[1] === error))
  })
})
