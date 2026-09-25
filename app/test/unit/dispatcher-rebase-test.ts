import { after, before, describe, it, mock, TestContext } from 'node:test'
import assert from 'node:assert'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import type { AppStore } from '../../src/lib/stores/app-store'
import type { Dispatcher } from '../../src/ui/dispatcher'
import type { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import type { TestStatsDatabase } from '../helpers/databases/test-stats-database'
import type { Repository } from '../../src/models/repository'
import type { Branch } from '../../src/models/branch'
import type { IMultiCommitOperationState } from '../../src/lib/app-state'
import {
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../../src/models/multi-commit-operation'

/**
 * Covers the regression behind desktop/desktop#21904 end to end through the
 * dispatcher.
 *
 * A rebase blocked by uncommitted local changes clears the multi commit
 * operation state before the error reaches the user. The retry that follows
 * the user stashing those changes re-enters `Dispatcher.rebase` directly
 * rather than going back through `startRebase`, so it arrives with no state at
 * all. Before the fix, that combination returned silently and the rebase never
 * ran, which is exactly what the issue reported.
 *
 * These drive the real dispatcher against a real repository, so they fail if
 * the restore is removed from `rebase`, if the state is rebuilt incorrectly,
 * or if the rebase itself stops running.
 *
 * Note: every runtime import happens inside `before` so that the module mocks
 * are registered before the dispatcher and its dependencies are loaded.
 */
describe('Dispatcher rebase retry after stashing', () => {
  let appStore: AppStore
  let dispatcher: Dispatcher
  let repositoryStateCache: RepositoryStateCache
  let testStores: import('../helpers/app-store-test-harness').ITestStores
  let statsDb: TestStatsDatabase | undefined

  let setupEmptyRepository: typeof import('../helpers/repositories').setupEmptyRepository
  let scaffolding: typeof import('../helpers/repository-scaffolding')
  let git: typeof import('../../src/lib/git')

  after(() => {
    // The app store keeps background work and database connections open for
    // the lifetime of the app, which would otherwise hold the test process
    // open after the assertions have finished.
    appStore?.['repositoryIndicatorUpdater']?.stop()
    testStores?.repositoriesStore?.['db']?.close()
    testStores?.gitHubUserStore?.['database']?.close()
    testStores?.issuesStore?.['db']?.close()
    testStores?.pullRequestStore?.['db']?.close()
    statsDb?.close()
    mock.restoreAll()
  })

  before(async () => {
    // The dispatcher pulls in `install-cli`, which loads the `fs-admin` native
    // module. That binary only ships with the packaged app, so it has to be
    // stubbed out before the dispatcher is imported.
    mock.module('../../src/ui/lib/install-cli', {
      namedExports: {
        InstalledCLIPath: '/usr/local/bin/github',
        installCLI: () => Promise.resolve(),
      },
    })

    mock.module('../../src/ui/main-process-proxy', {
      namedExports: {
        ...(await import('../../src/ui/main-process-proxy')),
        // These push menu state to the main process over IPC, which has no
        // counterpart outside the running app.
        getAppMenu: () => {},
        updateMenuState: () => {},
        updatePreferredAppMenuItemLabels: () => {},
      },
    })

    const { AppStore } = await import('../../src/lib/stores/app-store')
    const { Dispatcher } = await import('../../src/ui/dispatcher')
    const { AliveStore } = await import('../../src/lib/stores/alive-store')
    const { CopilotStore } = await import('../../src/lib/stores/copilot-store')
    const { NotificationsStore } = await import(
      '../../src/lib/stores/notifications-store'
    )
    const { PullRequestCoordinator } = await import(
      '../../src/lib/stores/pull-request-coordinator'
    )
    const { createTestStores } = await import(
      '../helpers/app-store-test-harness'
    )
    const { StatsStore } = await import('../../src/lib/stats')
    const { TestStatsDatabase } = await import(
      '../helpers/databases/test-stats-database'
    )
    const { TestActivityMonitor } = await import(
      '../helpers/test-activity-monitor'
    )
    const { fakePost } = await import('../fake-stats-post')

    setupEmptyRepository = (await import('../helpers/repositories'))
      .setupEmptyRepository
    scaffolding = await import('../helpers/repository-scaffolding')
    git = await import('../../src/lib/git')

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

    repositoryStateCache = stores.repositoryStateCache
    testStores = stores
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

    dispatcher = new Dispatcher(
      appStore,
      stores.repositoryStateCache,
      statsStore,
      stores.commitStatusStore
    )

    // A completed rebase ends with a full repository refresh, which kicks off
    // background work (indicator polling, metric updates) that never settles
    // outside the running app and would hold the test process open. The rebase
    // itself, the status load it depends on, and the operation state handling
    // under test all stay real.
    mock.method(appStore, '_refreshRepository', () => Promise.resolve())
  })

  /**
   * Builds a repository where `feature` has diverged from `master`, leaving
   * `feature` checked out so it is the branch being rebased.
   */
  async function setupDivergedBranches(t: TestContext): Promise<{
    repository: Repository
    baseBranch: Branch
    targetBranch: Branch
  }> {
    const repository = await setupEmptyRepository(t)

    await scaffolding.makeCommit(repository, {
      entries: [
        { path: 'base.txt', contents: 'base' },
        { path: 'shared.txt', contents: 'shared\n' },
      ],
      commitMessage: 'initial commit',
    })

    await scaffolding.createBranch(repository, 'feature', 'HEAD')
    await scaffolding.switchTo(repository, 'feature')
    await scaffolding.makeCommit(repository, {
      entries: [{ path: 'feature.txt', contents: 'feature' }],
      commitMessage: 'feature commit',
    })

    await scaffolding.switchTo(repository, 'master')
    // Touching `shared.txt` here is what lets a local edit to that same file
    // block the rebase, which is the situation the issue describes.
    await scaffolding.makeCommit(repository, {
      entries: [
        { path: 'master.txt', contents: 'master' },
        { path: 'shared.txt', contents: 'shared, changed on master\n' },
      ],
      commitMessage: 'master commit',
    })

    await scaffolding.switchTo(repository, 'feature')

    const branches = await git.getBranches(repository)
    const baseBranch = branches.find(b => b.name === 'master')
    const targetBranch = branches.find(b => b.name === 'feature')

    assert.ok(baseBranch !== undefined, 'expected a master branch')
    assert.ok(targetBranch !== undefined, 'expected a feature branch')

    return { repository, baseBranch, targetBranch }
  }

  it('rebases and restores the operation state when the state was cleared', async t => {
    const { repository, baseBranch, targetBranch } =
      await setupDivergedBranches(t)

    // The failed first attempt ends the operation, so the retry arrives with
    // no state at all. This is the exact condition that used to no-op.
    repositoryStateCache.clearMultiCommitOperationState(repository)
    assert.equal(
      repositoryStateCache.get(repository).multiCommitOperationState,
      null
    )

    // Records the restore while still letting it run, so the rebuilt state can
    // be inspected even though a completed rebase ends the operation again.
    const initialize = t.mock.method(
      appStore,
      '_initializeMultiCommitOperation'
    )

    await dispatcher.rebase(repository, baseBranch, targetBranch)

    // The state has to be rebuilt as a rebase of the right commits, otherwise
    // the progress dialog and the completion handling have nothing to work with.
    assert.equal(
      initialize.mock.callCount(),
      1,
      'expected the cleared operation state to be restored exactly once'
    )

    const [, operationDetail, restoredTarget, restoredCommits] =
      initialize.mock.calls[0].arguments

    assert.equal(operationDetail.kind, MultiCommitOperationKind.Rebase)
    assert.equal(restoredTarget, targetBranch)
    assert.deepEqual(
      restoredCommits.map(c => c.summary),
      ['feature commit'],
      'expected the commits being replayed to be derived from the branch tips'
    )

    // And the rebase must actually have run: `feature` now sits on top of the
    // commit that was only on `master`.
    const commits = await git.getCommits(repository, 'HEAD', 10)
    assert.deepEqual(
      commits.map(c => c.summary),
      ['feature commit', 'master commit', 'initial commit']
    )
  })

  it('does not rebase when an unrelated operation is in progress', async t => {
    const { repository, baseBranch, targetBranch } =
      await setupDivergedBranches(t)

    const commitsBefore = await git.getCommits(repository, 'HEAD', 10)

    const mergeState: IMultiCommitOperationState = {
      step: { kind: MultiCommitOperationStepKind.ShowProgress },
      operationDetail: {
        kind: MultiCommitOperationKind.Merge,
        isSquash: false,
        sourceBranch: null,
      },
      progress: {
        kind: 'multiCommitOperation',
        currentCommitSummary: '',
        position: 1,
        totalCommitCount: 0,
        value: 0,
      },
      userHasResolvedConflicts: false,
      useCopilotConflictResolution: false,
      copilotResolutions: null,
      copilotSkippedFiles: null,
      copilotResolutionProgress: null,
      copilotResolutionSummary: null,
      copilotResolutionAbortController: null,
      copilotResolutionModel: null,
      originalBranchTip: null,
      targetBranch: null,
    }

    repositoryStateCache.initializeMultiCommitOperationState(
      repository,
      mergeState
    )

    await dispatcher.rebase(repository, baseBranch, targetBranch)

    const commitsAfter = await git.getCommits(repository, 'HEAD', 10)
    assert.deepEqual(
      commitsAfter.map(c => c.summary),
      commitsBefore.map(c => c.summary),
      'the merge in progress should not have been replaced by a rebase'
    )
  })

  it('completes the rebase after the user stashes the blocking changes', async t => {
    const { repository, baseBranch, targetBranch } =
      await setupDivergedBranches(t)

    // Leave an uncommitted edit to a file the rebase has to touch. This is the
    // situation the user is in when Desktop offers to stash and continue.
    await writeFile(
      join(repository.path, 'shared.txt'),
      'shared, edited locally\n'
    )

    await appStore._loadStatus(repository)

    const commits = await git.getCommitsBetweenCommits(
      repository,
      baseBranch.tip.sha,
      targetBranch.tip.sha
    )
    assert.ok(commits !== null, 'expected to resolve the commits to rebase')

    // Step 1: the user starts the rebase and git refuses it.
    await dispatcher.startRebase(repository, baseBranch, targetBranch, commits)

    // The failed attempt tears down its own operation state. This is the
    // precondition that used to make the retry a no-op.
    assert.equal(
      repositoryStateCache.get(repository).multiCommitOperationState,
      null,
      'expected the blocked rebase to have ended the operation'
    )

    const blocked = await git.getCommits(repository, 'HEAD', 10)
    assert.deepEqual(
      blocked.map(c => c.summary),
      ['feature commit', 'initial commit'],
      'expected the blocked rebase to have left the branch alone'
    )

    // Step 2: the user picks "Stash changes and continue".
    const stashed = await dispatcher.createStashForCurrentBranch(
      repository,
      false
    )
    assert.equal(stashed, true, 'expected the local changes to be stashed')

    // Step 3: the dialog retries the rebase, which re-enters `rebase` directly
    // rather than going back through `startRebase`.
    await dispatcher.rebase(repository, baseBranch, targetBranch)

    // The rebase the user asked for finally happens.
    const rebased = await git.getCommits(repository, 'HEAD', 10)
    assert.deepEqual(
      rebased.map(c => c.summary),
      ['feature commit', 'master commit', 'initial commit'],
      'expected the stashed retry to complete the rebase'
    )
  })
})
