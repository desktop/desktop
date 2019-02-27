import * as Path from 'path'
import * as FSE from 'fs-extra'
import { GitProcess } from 'dugite'

import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  IssuesStore,
  SignInStore,
  RepositoriesStore,
  AccountsStore,
  PullRequestStore,
} from '../../src/lib/stores'
import {
  TestGitHubUserDatabase,
  TestStatsDatabase,
  TestIssuesDatabase,
  TestRepositoriesDatabase,
  TestPullRequestDatabase,
} from '../helpers/databases'
import {
  setupEmptyRepository,
  setupConflictedRepoWithMultipleFiles,
  setupConflictedRepoWithUnrelatedCommittedChange,
} from '../helpers/repositories'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

import { StatsStore } from '../../src/lib/stats'

import {
  RepositorySectionTab,
  SelectionType,
  IRepositoryState,
} from '../../src/lib/app-state'
import { Repository } from '../../src/models/repository'
import { Commit } from '../../src/models/commit'
import { getCommit, IStatusResult } from '../../src/lib/git'
import { TestActivityMonitor } from '../helpers/test-activity-monitor'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { ApiRepositoriesStore } from '../../src/lib/stores/api-repositories-store'
import { getStatusOrThrow } from '../helpers/status'
import { AppFileStatusKind } from '../../src/models/status'
import { ManualConflictResolutionKind } from '../../src/models/manual-conflict-resolution'

// enable mocked version
jest.mock('../../src/lib/window-state')

describe('AppStore', () => {
  async function createAppStore(): Promise<AppStore> {
    const db = new TestGitHubUserDatabase()
    await db.reset()

    const issuesDb = new TestIssuesDatabase()
    await issuesDb.reset()

    const statsDb = new TestStatsDatabase()
    await statsDb.reset()

    const repositoriesDb = new TestRepositoriesDatabase()
    await repositoriesDb.reset()
    const repositoriesStore = new RepositoriesStore(repositoriesDb)

    const accountsStore = new AccountsStore(
      new InMemoryStore(),
      new AsyncInMemoryStore()
    )

    const pullRequestStore = new PullRequestStore(
      new TestPullRequestDatabase(),
      repositoriesStore
    )

    const githubUserStore = new GitHubUserStore(db)

    const repositoryStateManager = new RepositoryStateCache(repo =>
      githubUserStore.getUsersForRepository(repo)
    )

    const apiRepositoriesStore = new ApiRepositoriesStore(accountsStore)

    return new AppStore(
      githubUserStore,
      new CloningRepositoriesStore(),
      new IssuesStore(issuesDb),
      new StatsStore(statsDb, new TestActivityMonitor()),
      new SignInStore(),
      accountsStore,
      repositoriesStore,
      pullRequestStore,
      repositoryStateManager,
      apiRepositoriesStore
    )
  }

  it('can select a repository', async () => {
    const appStore = await createAppStore()

    const repo = await setupEmptyRepository()

    await appStore._selectRepository(repo)

    const state = appStore.getState()
    expect(state.selectedState).not.toBeNull()
    expect(state.selectedState!.repository.path).toBe(repo.path)
  })

  describe('undo first commit', () => {
    function getAppState(appStore: AppStore): IRepositoryState {
      const selectedState = appStore.getState().selectedState
      if (selectedState == null) {
        throw new Error('No selected state for AppStore')
      }

      switch (selectedState.type) {
        case SelectionType.Repository:
          return selectedState.state
        default:
          throw new Error(
            `Got selected state of type ${
              selectedState.type
            } which is not supported.`
          )
      }
    }

    let repo: Repository | null = null
    let firstCommit: Commit | null = null

    beforeEach(async () => {
      repo = await setupEmptyRepository()

      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      await FSE.writeFile(filePath, 'SOME WORDS GO HERE\n')

      await GitProcess.exec(['add', file], repo.path)
      await GitProcess.exec(['commit', '-m', 'added file'], repo.path)

      firstCommit = await getCommit(repo, 'master')
      expect(firstCommit).not.toBeNull()
      expect(firstCommit!.parentSHAs).toHaveLength(0)
    })

    // This test is failing too often for my liking on Windows.
    //
    // For the moment, I need to make it skip the CI test suite
    // but I'd like to better understand why it's failing and
    // either rewrite the test or fix whatever bug it is
    // encountering.
    //
    // I've opened https://github.com/desktop/desktop/issues/5543
    // to ensure this isn't forgotten.
    it.skip('clears the undo commit dialog', async () => {
      const repository = repo!

      const appStore = await createAppStore()

      // select the repository and show the changes view
      await appStore._selectRepository(repository)
      await appStore._changeRepositorySection(
        repository,
        RepositorySectionTab.Changes
      )

      let state = getAppState(appStore)
      expect(state.localCommitSHAs).toHaveLength(1)

      await appStore._undoCommit(repository, firstCommit!)

      state = getAppState(appStore)
      expect(state.localCommitSHAs).toHaveLength(0)
    })
  })
  describe('_finishConflictedMerge', () => {
    describe('with tracked and untracked files', () => {
      let appStore: AppStore, repo: Repository, status: IStatusResult

      beforeEach(async () => {
        appStore = await createAppStore()
        repo = await setupConflictedRepoWithMultipleFiles()
        await appStore._selectRepository(repo)
        status = await getStatusOrThrow(repo)
      })

      it('commits tracked files', async () => {
        await appStore._finishConflictedMerge(
          repo,
          status.workingDirectory,
          new Map<string, ManualConflictResolutionKind>()
        )
        const newStatus = await getStatusOrThrow(repo)
        const trackedFiles = newStatus.workingDirectory.files.filter(
          f => f.status.kind !== AppFileStatusKind.Untracked
        )
        expect(trackedFiles).toHaveLength(0)
      })
      it('leaves untracked files untracked', async () => {
        await appStore._finishConflictedMerge(
          repo,
          status.workingDirectory,
          new Map<string, ManualConflictResolutionKind>()
        )
        const newStatus = await getStatusOrThrow(repo)
        const untrackedfiles = newStatus.workingDirectory.files.filter(
          f => f.status.kind === AppFileStatusKind.Untracked
        )
        expect(untrackedfiles).toHaveLength(1)
      })
    })

    describe('with unrelated changes that are uncommitted', () => {
      let appStore: AppStore, repo: Repository, status: IStatusResult

      beforeEach(async () => {
        appStore = await createAppStore()
        repo = await setupConflictedRepoWithUnrelatedCommittedChange()
        await appStore._selectRepository(repo)
        status = await getStatusOrThrow(repo)
      })
      it("doesn't commit unrelated changes", async () => {
        await appStore._finishConflictedMerge(
          repo,
          status.workingDirectory,
          new Map<string, ManualConflictResolutionKind>()
        )
        const newStatus = await getStatusOrThrow(repo)
        const modifiedFiles = newStatus.workingDirectory.files.filter(
          f => f.status.kind === AppFileStatusKind.Modified
        )
        expect(modifiedFiles).toHaveLength(1)
      })
    })
  })
})
