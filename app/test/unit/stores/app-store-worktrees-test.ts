import assert from 'node:assert'
import { after, before, describe, it, mock } from 'node:test'
import * as Path from 'path'
import { exec } from 'dugite'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { FoldoutType } from '../../../src/lib/app-state'
import { Repository } from '../../../src/models/repository'

interface IFakeWorktreeMonitor {
  readonly gitDir: string
  readonly onChange: () => void
  stopped: boolean
}

describe('AppStore worktrees', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase | undefined
  const monitors = new Array<IFakeWorktreeMonitor>()

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
    mock.module('../../../src/lib/stores/helpers/worktree-monitor', {
      namedExports: {
        monitorWorktrees: (gitDir: string, onChange: () => void) => {
          const monitor = { gitDir, onChange, stopped: false }
          monitors.push(monitor)
          return () => {
            monitor.stopped = true
          }
        },
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
    const pullRequestCoordinator = new PullRequestCoordinator(
      stores.pullRequestStore,
      stores.repositoriesStore
    )
    const notificationsStore = new NotificationsStore(
      stores.accountsStore,
      new AliveStore(stores.accountsStore),
      pullRequestCoordinator,
      statsStore,
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
      pullRequestCoordinator,
      stores.repositoryStateCache,
      stores.apiRepositoriesStore,
      notificationsStore,
      new CopilotStore(stores.accountsStore)
    )
  })

  function startMonitoring(repository: Repository) {
    appStore['selectedRepository'] = repository
    appStore['startMonitoringWorktrees'](repository)

    const monitor = monitors.at(-1)
    assert(monitor !== undefined)
    return monitor
  }

  it('loads worktrees added elsewhere when the worktree list is shown', async t => {
    const { setupEmptyRepository } = await import('../../helpers/repositories')
    const { makeCommit } = await import('../../helpers/repository-scaffolding')
    const { createTempDirectory } = await import('../../helpers/temp')
    const repository = await setupEmptyRepository(t, 'main')
    await makeCommit(repository, {
      entries: [{ path: 'README', contents: 'hello' }],
    })
    appStore['selectedRepository'] = repository
    t.after(() => appStore._closeFoldout(FoldoutType.Worktree))

    // Added outside of Desktop, by the GitHub Copilot app for instance.
    const worktreePath = Path.join(await createTempDirectory(t), 'feature')
    const added = await exec(
      ['worktree', 'add', '-b', 'feature', '--', worktreePath],
      repository.path
    )
    assert.strictEqual(added.exitCode, 0, added.stderr)

    await appStore._showFoldout({ type: FoldoutType.Worktree })

    const { worktrees } = appStore['repositoryStateCache'].get(repository)
    assert.deepStrictEqual(
      worktrees.map(worktree => worktree.branch),
      ['refs/heads/main', 'refs/heads/feature']
    )
  })

  it('refreshes the selected repository when its worktrees change', t => {
    const repository = new Repository(
      '/repositories/monitored',
      1,
      null,
      false,
      null,
      {},
      false,
      '/repositories/monitored/.git'
    )
    const refresh = t.mock.method(
      appStore,
      '_refreshOrRecoverRepository',
      async () => {}
    )

    const monitor = startMonitoring(repository)
    assert.strictEqual(monitor.gitDir, repository.resolvedGitDir)

    monitor.onChange()

    assert.strictEqual(refresh.mock.callCount(), 1)
    assert.strictEqual(refresh.mock.calls[0].arguments[0], repository)
  })

  it('refreshes the repository as it is currently selected', t => {
    const repository = new Repository('/repositories/a', 2, null, false)
    const renamed = new Repository('/repositories/a', 2, null, false, 'alias')
    const refresh = t.mock.method(
      appStore,
      '_refreshOrRecoverRepository',
      async () => {}
    )

    const monitor = startMonitoring(repository)
    appStore['selectedRepository'] = renamed
    monitor.onChange()

    assert.strictEqual(refresh.mock.calls[0].arguments[0], renamed)
  })

  it('ignores worktree changes once another repository is selected', t => {
    const repository = new Repository('/repositories/first', 3, null, false)
    const refresh = t.mock.method(
      appStore,
      '_refreshOrRecoverRepository',
      async () => {}
    )

    const monitor = startMonitoring(repository)
    appStore['selectedRepository'] = new Repository(
      '/repositories/second',
      4,
      null,
      false
    )
    monitor.onChange()

    assert.strictEqual(refresh.mock.callCount(), 0)
  })

  it('stops monitoring when the repository is no longer selected', async () => {
    const monitor = startMonitoring(
      new Repository('/repositories/deselected', 5, null, false)
    )

    await appStore._selectRepository(null)

    assert.strictEqual(monitor.stopped, true)
  })

  it('monitors one repository at a time', () => {
    const first = startMonitoring(
      new Repository('/repositories/first', 6, null, false)
    )
    const second = startMonitoring(
      new Repository('/repositories/second', 7, null, false)
    )

    assert.strictEqual(first.stopped, true)
    assert.strictEqual(second.stopped, false)
  })
})
