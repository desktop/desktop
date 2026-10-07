import { TestContext } from 'node:test'
import { join } from 'path'
import { ipcRenderer } from 'electron'
import { AppStore } from '../../src/lib/stores/app-store'
import { AliveStore } from '../../src/lib/stores/alive-store'
import { NotificationsStore } from '../../src/lib/stores/notifications-store'
import { PullRequestCoordinator } from '../../src/lib/stores/pull-request-coordinator'
import { Dispatcher } from '../../src/ui/dispatcher'
import { StatsStore } from '../../src/lib/stats'
import { Repository } from '../../src/models/repository'
import { ICopilotAssistedCommitRequest } from '../../src/models/copilot-assisted-commit'
import { DiffSelectionType } from '../../src/models/diff'
import { createTestStores } from './app-store-test-harness'
import { TestStatsDatabase } from './databases/test-stats-database'
import { TestActivityMonitor } from './test-activity-monitor'
import { fakePost } from '../fake-stats-post'
import {
  createMockPlanner,
  makeCopilotAccount,
  wholeSelectionResponse,
} from './copilot-assisted-commit'

/** Real AppStore/Dispatcher and Git, with synthetic model/auth and UI clock only. */
export async function createAssistedCommitRunHarness(t: TestContext) {
  const previousSend = ipcRenderer.send
  ipcRenderer.send = () => {}
  t.after(() => {
    ipcRenderer.send = previousSend
  })
  t.mock.method(window, 'setTimeout', () => 0)
  t.mock.method(window, 'addEventListener', () => {})
  const previousPreviewFeatures = process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
  process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = '1'
  t.after(() => {
    localStorage.clear()
    if (previousPreviewFeatures === undefined) {
      delete process.env.GITHUB_DESKTOP_PREVIEW_FEATURES
    } else {
      process.env.GITHUB_DESKTOP_PREVIEW_FEATURES = previousPreviewFeatures
    }
  })
  const stores = createTestStores()
  await stores.repositoriesStore['db'].delete()
  await stores.repositoriesStore['db'].open()
  t.after(() => stores.repositoriesStore['db'].close())
  const statsDb = new TestStatsDatabase()
  await statsDb.reset()
  const statsStore = new StatsStore(
    statsDb,
    new TestActivityMonitor(),
    fakePost
  )
  t.after(() => statsDb.close())
  const commits = t.mock.method(statsStore, 'recordCommit')
  const coordinator = new PullRequestCoordinator(
    stores.pullRequestStore,
    stores.repositoriesStore
  )
  const notifications = new NotificationsStore(
    stores.accountsStore,
    new AliveStore(stores.accountsStore),
    coordinator,
    statsStore
  )
  const planner = createMockPlanner(t)
  const runtime = t.mock.method(
    planner.store,
    'isAssistedCommitRuntimeAvailable',
    async () => true
  )
  const defaultProposal: typeof planner.store.proposeAssistedCommitPlan =
    async (_account, analysis) =>
      wholeSelectionResponse(analysis, 'Commit selected changes')
  const propose = t.mock.method(
    planner.store,
    'proposeAssistedCommitPlan',
    defaultProposal
  )
  t.mock.method(planner.store, 'getQuotaSnapshots', async () => null)
  const appStore = new AppStore(
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
    notifications,
    planner.store
  )
  appStore['accounts'] = [makeCopilotAccount()]
  appStore['windowState'] = 'hidden'
  appStore['assistedCommitDisclaimerLastSeen'] = Date.now()
  const dispatcher = new Dispatcher(
    appStore,
    stores.repositoryStateCache,
    statsStore,
    stores.commitStatusStore
  )

  const register = async (source: Repository) => {
    const id = await stores.repositoriesStore['db'].repositories.add({
      path: source.path,
      gitHubRepositoryID: null,
      missing: false,
      alias: null,
      gitDir: join(source.path, '.git'),
      lastStashCheckDate: null,
    })
    const repository = new Repository(
      source.path,
      id,
      source.gitHubRepository,
      false,
      null,
      {},
      false,
      join(source.path, '.git')
    )
    await appStore._loadStatus(repository)
    await appStore['updateChangesWorkingDirectoryDiff'](repository)
    dispatcher.setCommitMode(repository, 'copilot')
    return repository
  }
  const request = (
    repository: Repository,
    overrides: Partial<ICopilotAssistedCommitRequest> = {}
  ): ICopilotAssistedCommitRequest => {
    const state = stores.repositoryStateCache.get(repository)
    return {
      files: state.changesState.workingDirectory.files.filter(
        file => file.selection.getSelectionType() !== DiffSelectionType.None
      ),
      trailers: [],
      skipCommitHooks: state.skipCommitHooks,
      signOffCommits: state.signOffCommits,
      allowEmptyCommit: state.allowEmptyCommit,
      ...overrides,
    }
  }
  const state = (repository: Repository) =>
    stores.repositoryStateCache.get(repository)
  const cancel = (repository: Repository) => {
    const run = state(repository).changesState.assistedCommit
    if (run.kind !== 'idle') {
      dispatcher.cancelCopilotAssistedCommits(repository, run.runId)
    }
  }
  return {
    appStore,
    dispatcher,
    planner,
    propose,
    runtime,
    stores,
    statsStore,
    commits,
    register,
    request,
    state,
    cancel,
  }
}
