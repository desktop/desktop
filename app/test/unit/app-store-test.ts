/* tslint:disable:no-sync-functions */

import * as chai from 'chai'
const expect = chai.expect

import * as Path from 'path'
import * as Fs from 'fs'
import { GitProcess } from 'dugite'

import {
  AppStore,
  GitHubUserStore,
  CloningRepositoriesStore,
  EmojiStore,
  IssuesStore,
  SignInStore,
} from '../../src/lib/dispatcher'
import { TestGitHubUserDatabase } from '../test-github-user-database'
import { TestStatsDatabase } from '../test-stats-database'
import { TestIssuesDatabase } from '../test-issues-database'
import { StatsStore } from '../../src/lib/stats'

import {
  RepositorySection,
  SelectionType,
  IRepositoryState,
} from '../../src/lib/app-state'
import { Repository } from '../../src/models/repository'
import { Commit } from '../../src/models/commit'
import { getCommit } from '../../src/lib/git'

import { setupEmptyRepository } from '../fixture-helper'

describe('AppStore', () => {
  async function createAppStore(): Promise<AppStore> {
    const db = new TestGitHubUserDatabase()
    await db.reset()

    const issuesDb = new TestIssuesDatabase()
    await issuesDb.reset()

    const statsDb = new TestStatsDatabase()
    await statsDb.reset()

    return new AppStore(
      new GitHubUserStore(db),
      new CloningRepositoriesStore(),
      new EmojiStore(),
      new IssuesStore(issuesDb),
      new StatsStore(statsDb),
      new SignInStore()
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
      if (!selectedState) {
        throw new chai.AssertionError('No selected state for AppStore')
      }

      switch (selectedState.type) {
        case SelectionType.Repository:
          return selectedState.state
        default:
          throw new chai.AssertionError(
            `Got selected state of type ${selectedState.type} which is not supported.`
          )
      }
    }

    let repo: Repository | null = null
    let firstCommit: Commit | null = null

    beforeEach(async () => {
      repo = await setupEmptyRepository()

      const file = 'README.md'
      const filePath = Path.join(repo.path, file)

      Fs.writeFileSync(filePath, 'SOME WORDS GO HERE\n')

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
        RepositorySection.Changes
      )

      let state = getAppState(appStore)
      expect(state.localCommitSHAs.length).to.equal(1)

      await appStore._undoCommit(repository, firstCommit!)

      state = getAppState(appStore)
      expect(state.localCommitSHAs).to.be.empty
    })
  })
})
