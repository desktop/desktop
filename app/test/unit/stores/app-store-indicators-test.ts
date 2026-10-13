import assert from 'node:assert'
import { after, before, describe, it, mock } from 'node:test'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { CloningRepository } from '../../../src/models/cloning-repository'
import { Repository } from '../../../src/models/repository'

describe('AppStore repository indicators', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase | undefined

  after(() => {
    statsDb?.close()
    mock.restoreAll()
  })

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
})
