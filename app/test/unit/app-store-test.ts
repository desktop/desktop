import { expect, AssertionError } from 'chai'

import * as Path from 'path'
import * as FSE from 'fs-extra'
import { GitProcess } from 'dugite'

import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  EmojiStore,
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
import { setupEmptyRepository } from '../helpers/repositories'
import { InMemoryStore, AsyncInMemoryStore } from '../helpers/stores'

import { StatsStore } from '../../src/lib/stats'

import {
  RepositorySectionTab,
  SelectionType,
  IRepositoryState,
} from '../../src/lib/app-state'
import { Repository } from '../../src/models/repository'
import { Commit } from '../../src/models/commit'
import { getCommit } from '../../src/lib/git'
import { TestActivityMonitor } from '../helpers/test-activity-monitor'

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

    return new AppStore(
      new GitHubUserStore(db),
      new CloningRepositoriesStore(),
      new EmojiStore(),
      new IssuesStore(issuesDb),
      new StatsStore(statsDb, new TestActivityMonitor()),
      new SignInStore(),
      accountsStore,
      repositoriesStore,
      pullRequestStore
    )
  }

  it('can select a repository', async () => {
    const appStore = await createAppStore()

    const repo = await setupEmptyRepository()

    await appStore._selectRepository(repo)

    const state = appStore.getState()
    expect(state.selectedState).is.not.null
    expect(state.selectedState!.repository.path).to.equal(repo.path)
  })

  describe('undo first commit', () => {
    function getAppState(appStore: AppStore): IRepositoryState {
      const selectedState = appStore.getState().selectedState
      if (selectedState == null) {
        throw new AssertionError('No selected state for AppStore')
      }

      switch (selectedState.type) {
        case SelectionType.Repository:
          return selectedState.state
        default:
          throw new AssertionError(
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
      expect(firstCommit).to.not.equal(null)
      expect(firstCommit!.parentSHAs.length).to.equal(0)
    })

    it('clears the undo commit dialog', async () => {
      const repository = repo!

      const appStore = await createAppStore()

      // select the repository and show the changes view
      await appStore._selectRepository(repository)
      await appStore._changeRepositorySection(
        repository,
        RepositorySectionTab.Changes
      )

      let state = getAppState(appStore)
      expect(state.localCommitSHAs.length).to.equal(1)

      await appStore._undoCommit(repository, firstCommit!)

      state = getAppState(appStore)
      expect(state.localCommitSHAs).to.be.empty
    })
  })
})
