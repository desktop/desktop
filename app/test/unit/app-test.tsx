import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as TestUtils from 'react-dom/test-utils'

import { App } from '../../src/ui/app'
import { Dispatcher } from '../../src/ui/dispatcher'
import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  IssuesStore,
  SignInStore,
  RepositoriesStore,
  AccountsStore,
  PullRequestStore,
  PullRequestCoordinator,
} from '../../src/lib/stores'
import { InMemoryDispatcher } from '../helpers/in-memory-dispatcher'
import {
  TestGitHubUserDatabase,
  TestStatsDatabase,
  TestIssuesDatabase,
  TestRepositoriesDatabase,
  TestPullRequestDatabase,
} from '../helpers/databases'
import { StatsStore } from '../../src/lib/stats'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'
import { TestActivityMonitor } from '../helpers/test-activity-monitor'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { ApiRepositoriesStore } from '../../src/lib/stores/api-repositories-store'
import { CommitStatusStore } from '../../src/lib/stores/commit-status-store'
import { AheadBehindStore } from '../../src/lib/stores/ahead-behind-store'
import { AliveStore } from '../../src/lib/stores/alive-store'
import { NotificationsStore } from '../../src/lib/stores/notifications-store'
import { NotificationsDebugStore } from '../../src/lib/stores/notifications-debug-store'

describe('App', () => {
  let appStore: AppStore
  let dispatcher: Dispatcher
  let statsStore: StatsStore
  let repositoryStateManager: RepositoryStateCache
  let githubUserStore: GitHubUserStore
  let issuesStore: IssuesStore
  let aheadBehindStore: AheadBehindStore
  let notificationsDebugStore: NotificationsDebugStore

  beforeEach(async () => {
    const db = new TestGitHubUserDatabase()
    await db.reset()

    const issuesDb = new TestIssuesDatabase()
    await issuesDb.reset()

    const statsDb = new TestStatsDatabase()
    await statsDb.reset()
    statsStore = new StatsStore(statsDb, new TestActivityMonitor())

    const repositoriesDb = new TestRepositoriesDatabase()
    await repositoriesDb.reset()
    const repositoriesStore = new RepositoriesStore(repositoriesDb)

    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )

    const pullRequestCoordinator = new PullRequestCoordinator(
      new PullRequestStore(new TestPullRequestDatabase(), repositoriesStore),
      repositoriesStore
    )

    githubUserStore = new GitHubUserStore(db)
    issuesStore = new IssuesStore(issuesDb)

    repositoryStateManager = new RepositoryStateCache(statsStore)

    const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)
    const commitStatusStore = new CommitStatusStore(accountsStore)
    aheadBehindStore = new AheadBehindStore()

    const aliveStore = new AliveStore(accountsStore)

    const notificationsStore = new NotificationsStore(
      accountsStore,
      aliveStore,
      pullRequestCoordinator,
      statsStore
    )
    notificationsStore.setNotificationsEnabled(false)

    notificationsDebugStore = new NotificationsDebugStore(
      accountsStore,
      notificationsStore,
      pullRequestCoordinator
    )

    appStore = new AppStore(
      githubUserStore,
      new CloningRepositoriesStore(),
      issuesStore,
      statsStore,
      new SignInStore(),
      accountsStore,
      repositoriesStore,
      pullRequestCoordinator,
      repositoryStateManager,
      apiRepositoriesStore,
      notificationsStore
    )

    dispatcher = new InMemoryDispatcher(
      appStore,
      repositoryStateManager,
      statsStore,
      commitStatusStore
    )
  })

  it('renders', async () => {
    const app = TestUtils.renderIntoDocument(
      <App
        dispatcher={dispatcher}
        appStore={appStore}
        repositoryStateManager={repositoryStateManager}
        issuesStore={issuesStore}
        gitHubUserStore={githubUserStore}
        aheadBehindStore={aheadBehindStore}
        notificationsDebugStore={notificationsDebugStore}
        startTime={0}
      />
    ) as unknown as React.Component<any, any>
    // Give any promises a tick to resolve.
    await wait(0)

    const node = ReactDOM.findDOMNode(app)
    expect(node).not.toBeNull()
  })
})

function wait(timeout: number): Promise<void> {
  return new Promise<void>(resolve => {
    setTimeout(resolve, timeout)
  })
}
