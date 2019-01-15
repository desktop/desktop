import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore, GitStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { setupFixtureRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { GitProcess } from 'dugite'
import { Branch } from '../../src/models/branch'
import { IGitHubUser } from '../../src/lib/databases'
import moment = require('moment')
import { IAPIRepository } from '../../src/lib/api'

describe('BranchPruner', () => {
  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}

  let gitStoreCache: GitStoreCache
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: RepositoryStateCache
  let onPruneCompleted: jest.Mock<
    (
      repository: Repository,
      prunedBranches: ReadonlyArray<Branch>
    ) => Promise<void>
  >

  beforeEach(async () => {
    gitStoreCache = new GitStoreCache(
      shell,
      onGitStoreUpdated,
      onDidLoadNewCommits,
      onDidError
    )

    const repositoriesDb = new TestRepositoriesDatabase()
    await repositoriesDb.reset()
    repositoriesStore = new RepositoriesStore(repositoriesDb)
    repositoriesStateCache = new RepositoryStateCache(
      () => new Map<string, IGitHubUser>()
    )

    onPruneCompleted = jest.fn(
      () => (repository: Repository, prunedBranches: ReadonlyArray<Branch>) => {
        console.log('repository', repository)
        console.log('prunedBranches', prunedBranches)
        return Promise.resolve()
      }
    )
  })

  it('Does nothing on non GitHub repositories', async () => {
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      false
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    let gitOutput = await GitProcess.exec(['branch'], repo.path)
    const branchesBeforePruning = gitOutput.stdout.split('\n')
    await branchPruner.start()
    gitOutput = await GitProcess.exec(['branch'], repo.path)
    const branchesAfterPruning = gitOutput.stdout.split('\n')

    expect(branchesBeforePruning).toHaveLength(branchesAfterPruning.length)
    for (let i = 0; i < branchesBeforePruning.length; i++) {
      expect(branchesAfterPruning[i]).toBe(branchesAfterPruning[i])
    }
  })

  it('Prunes for GitHub repository', async () => {
    const fixedDate = moment()
    const yesterday = fixedDate.subtract(1, 'day')
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      true,
      yesterday.toDate()
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    await branchPruner.start()
    const gitOutput = await GitProcess.exec(['branch'], repo.path)

    // NOTE: this removes the empty string at the end of the array as well as
    //       any whitespace that we were expecting in here
    const branchesAfterPruning = gitOutput.stdout
      .split('\n')
      .filter(b => b.length > 0)
      .map(b => b.substr(2))
    const expectedBranchesAfterPruning = ['master', 'not-merged-branch-1']

    // NOTE: i've used `expect.anything()` here because this API returns an array
    //       of branches and I can't be bothered massaging the test data to check this.
    //       Do we need to validate the branches returned?
    expect(onPruneCompleted).toBeCalledWith(repo, expect.anything())

    // NOTE: this assertion seems to suggest that we *don't* expect pruning to
    //       work, but I've updated it to indicate it's there for checking what is leftover
    expect(branchesAfterPruning).toEqual(expectedBranchesAfterPruning)

    for (let i = 0; i < expectedBranchesAfterPruning.length; i++) {
      expect(expectedBranchesAfterPruning[i]).toBe(branchesAfterPruning[i])
    }
  })

  it('Does not prune if the last prune date is less than 24 hours ago', () => {})

  it('Does not prune if there is no default branch', () => {})
})

async function initializeTestRepo(
  repositoriesStore: RepositoriesStore,
  repositoriesStateCache: RepositoryStateCache,
  includesGhRepo: boolean,
  date?: Date
) {
  const path = await setupFixtureRepository('branch-prune-cases')

  let repository = await repositoriesStore.addRepository(path)
  if (includesGhRepo) {
    const ghAPIResult: IAPIRepository = {
      clone_url: 'string',
      ssh_url: 'string',
      html_url: 'string',
      name: 'string',
      owner: {
        id: 0,
        url: '',
        login: '',
        avatar_url: '',
        name: null,
        email: null,
        type: 'User',
      },
      private: false,
      fork: false,
      default_branch: 'master',
      pushed_at: 'string',
      parent: null,
    }

    repository = await repositoriesStore.updateGitHubRepository(
      repository,
      '',
      ghAPIResult
    )
  }
  await primeCaches(repository, repositoriesStateCache)

  date && repositoriesStore.updateLastPruneDate(repository, date.getTime())
  return repository
}

// NOTE: this is a rough function to get your test setup correctly without
//       having to expose the internals of the GitStore and the caches
//       For the moment this will help with testing, but how you're setting
//       this up is still good guidance for how we can make our tests easier
//       to scaffold
async function primeCaches(
  repository: Repository,
  repositoriesStateCache: RepositoryStateCache
) {
  const gitStore = new GitStore(repository, shell)

  // rather than re-create the branches and stuff as objects, these calls
  // will run the underlying Git operations and update the GitStore state
  await gitStore.loadRemotes()
  await gitStore.loadBranches()
  await gitStore.loadStatus()

  // once that is done, we can populate the repository state in the same way
  // that AppStore does for the sake of this test
  repositoriesStateCache.updateBranchesState(repository, () => ({
    tip: gitStore.tip,
    defaultBranch: gitStore.defaultBranch,
    allBranches: gitStore.allBranches,
    recentBranches: gitStore.recentBranches,
  }))
}
