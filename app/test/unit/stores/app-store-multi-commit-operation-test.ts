import assert from 'node:assert'
import { after, before, describe, it, mock } from 'node:test'
import type { AppStore } from '../../../src/lib/stores/app-store'
import type { TestStatsDatabase } from '../../helpers/databases/test-stats-database'
import { Repository } from '../../../src/models/repository'
import {
  MultiCommitOperationKind,
  MultiCommitOperationStep,
  MultiCommitOperationStepKind,
} from '../../../src/models/multi-commit-operation'
import { IStatusResult } from '../../../src/lib/git'
import { createStatus } from '../../helpers/changes-state-helper'

describe('AppStore multi commit operation status updates', () => {
  let appStore: AppStore
  let statsDb: TestStatsDatabase | undefined
  let nextRepositoryId = 1

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
      new NotificationsStore(
        stores.accountsStore,
        new AliveStore(stores.accountsStore),
        pullRequestCoordinator,
        statsStore,
        stores.repositoriesStore
      ),
      new CopilotStore(stores.accountsStore)
    )
  })

  const rebaseStatus = createStatus({
    currentBranch: 'feature',
    currentTip: 'current-tip',
    rebaseInternalState: {
      targetBranch: 'feature',
      originalBranchTip: 'original-tip',
      baseBranchTip: 'base-tip',
    },
  })

  const showConflicts: MultiCommitOperationStep = {
    kind: MultiCommitOperationStepKind.ShowConflicts,
    conflictState: {
      kind: 'multiCommitOperation',
      manualResolutions: new Map(),
      ourBranch: 'main',
      theirBranch: 'feature',
    },
  }

  /**
   * Starts a rebase in the given step, then publishes `status` and returns
   * the operation step that remains.
   */
  async function publishDuringRebase(
    step: MultiCommitOperationStep,
    status: IStatusResult
  ) {
    const id = nextRepositoryId++
    const repository = new Repository(`/repo-${id}`, id, null, false)
    appStore._initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Rebase,
        sourceBranch: null,
        commits: [],
        currentTip: 'base-tip',
      },
      null,
      [],
      'original-tip'
    )
    appStore._setMultiCommitOperationStep(repository, step)

    await appStore['publishRepositoryStatus'](repository, status)

    const cache = appStore['repositoryStateCache']
    return cache.get(repository).multiCommitOperationState?.step.kind ?? null
  }

  it('ends the operation when the rebase ends outside the app', async () => {
    assert.equal(
      await publishDuringRebase(showConflicts, createStatus({})),
      null
    )
  })

  it('keeps the operation while the rebase conflicts remain', async () => {
    assert.equal(
      await publishDuringRebase(showConflicts, rebaseStatus),
      MultiCommitOperationStepKind.ShowConflicts
    )
  })

  it('keeps the operation while the app continues the rebase', async () => {
    const showProgress: MultiCommitOperationStep = {
      kind: MultiCommitOperationStepKind.ShowProgress,
    }
    assert.equal(
      await publishDuringRebase(showProgress, createStatus({})),
      MultiCommitOperationStepKind.ShowProgress
    )
  })
})
