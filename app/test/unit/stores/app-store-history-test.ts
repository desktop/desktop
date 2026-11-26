import assert from 'node:assert'
import { after, before, describe, it, mock } from 'node:test'
import type { TestContext } from 'node:test'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { HistoryTabMode } from '../../../src/lib/app-state'
import { Branch, BranchType } from '../../../src/models/branch'
import { TipState } from '../../../src/models/tip'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('AppStore history pagination', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase

  before(async () => {
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
    mock.method(window, 'requestAnimationFrame', () => 0)
    mock.method(window, 'addEventListener', () => {})

    const stores = createTestStores()
    statsDb = new TestStatsDatabase()
    await statsDb.reset()
    const statsStore = new StatsStore(
      statsDb,
      new TestActivityMonitor(),
      fakePost
    )
    const coordinator = new PullRequestCoordinator(
      stores.pullRequestStore,
      stores.repositoriesStore
    )
    appStore = new AppStore(
      stores.gitHubUserStore,
      stores.cloningRepositoriesStore,
      stores.issuesStore,
      statsStore,
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
        statsStore,
        stores.repositoriesStore
      ),
      new CopilotStore(stores.accountsStore)
    )
  })

  after(() => {
    statsDb?.close()
    mock.restoreAll()
  })

  async function setupHistory(t: TestContext) {
    const repository = await setupEmptyRepository(t)
    const cache = appStore['repositoryStateCache']
    const gitStore = appStore['gitStoreCache'].get(repository)
    t.after(() => appStore['gitStoreCache'].remove(repository))
    cache.updateCompareState(repository, () => ({
      formState: { kind: HistoryTabMode.History },
      tip: 'second',
      commitSHAs: ['second', 'initial'],
    }))
    return { repository, cache, gitStore }
  }

  for (const batch of [[], ['initial']]) {
    it(`keeps refreshed history when a stale batch returns ${
      batch.length === 0 ? 'no commits' : 'an already loaded commit'
    }`, async t => {
      const { repository, cache, gitStore } = await setupHistory(t)
      const refreshed = ['third', 'second', 'initial']
      const load = t.mock.method(gitStore, 'loadCommitBatch', async () => {
        cache.updateCompareState(repository, () => ({
          tip: 'third',
          commitSHAs: refreshed,
        }))
        return batch
      })

      await appStore._loadNextCommitBatch(repository)

      assert.deepStrictEqual(load.mock.calls[0].arguments, ['HEAD', 2])
      assert.strictEqual(
        cache.get(repository).compareState.commitSHAs,
        refreshed
      )
      assert.strictEqual(cache.get(repository).compareState.tip, 'third')
    })
  }

  it('keeps refreshed history when a local commit batch finishes late', async t => {
    const { repository, cache, gitStore } = await setupHistory(t)
    const branch = new Branch(
      'main',
      null,
      { sha: 'second' },
      BranchType.Local,
      'refs/heads/main'
    )
    cache.updateBranchesState(repository, () => ({
      tip: { kind: TipState.Valid, branch },
    }))
    gitStore['_localCommitSHAs'] = ['second', 'initial']
    const refreshed = ['third', 'second', 'initial']
    const localLoad = t.mock.method(gitStore, 'loadLocalCommits', async () => {
      cache.updateCompareState(repository, () => ({
        tip: 'third',
        commitSHAs: refreshed,
      }))
      return ['older']
    })
    const load = t.mock.method(gitStore, 'loadCommitBatch', async () => [])

    await appStore._loadNextCommitBatch(repository)

    assert.deepStrictEqual(localLoad.mock.calls[0].arguments, [branch, 2])
    assert.strictEqual(load.mock.callCount(), 0)
    assert.strictEqual(cache.get(repository).compareState.commitSHAs, refreshed)
  })

  it('appends the next batch when history has not been refreshed', async t => {
    const { repository, cache, gitStore } = await setupHistory(t)
    const load = t.mock.method(gitStore, 'loadCommitBatch', async () => [
      'older',
    ])

    await appStore._loadNextCommitBatch(repository)

    assert.deepStrictEqual(load.mock.calls[0].arguments, ['HEAD', 2])
    assert.deepStrictEqual(cache.get(repository).compareState.commitSHAs, [
      'second',
      'initial',
      'older',
    ])
    assert.strictEqual(cache.get(repository).compareState.tip, 'second')
  })
})
