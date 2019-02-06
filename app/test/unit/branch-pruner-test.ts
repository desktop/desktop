import * as moment from 'moment'
import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore, GitStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { setupFixtureRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { GitProcess } from 'dugite'
import { IGitHubUser } from '../../src/lib/databases'
import { IAPIRepository } from '../../src/lib/api'

describe('BranchPruner', () => {
  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}

  let gitStoreCache: GitStoreCache
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: RepositoryStateCache
  let onPruneCompleted: jest.Mock<(repository: Repository) => Promise<void>>

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
    onPruneCompleted = jest.fn(() => (_: Repository) => {
      return Promise.resolve()
    })
  })

  it('does nothing on non GitHub repositories', async () => {
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      false,
      'master'
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    const branchesBeforePruning = await getBranchesFromGit(repo)
    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesBeforePruning).toEqual(branchesAfterPruning)
  })

  it('prunes for GitHub repository', async () => {
    const fixedDate = moment()
    const lastPruneDate = fixedDate.subtract(1, 'day')
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate.toDate()
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    const expectedBranchesAfterPruning = [
      'not-deleted-branch-1',
      'deleted-branch-1',
    ]

    for (const branch of expectedBranchesAfterPruning) {
      expect(branchesAfterPruning).not.toContain(branch)
    }
  })

  it('does not prune if the last prune date is less than 24 hours ago', async () => {
    const fixedDate = moment()
    const lastPruneDate = fixedDate.subtract(4, 'hours')
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate.toDate()
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    const branchesBeforePruning = await getBranchesFromGit(repo)
    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesBeforePruning).toEqual(branchesAfterPruning)
  })

  it('Does not prune if there is no default branch', async () => {
    const fixedDate = moment()
    const lastPruneDate = fixedDate.subtract(1, 'day')
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      true,
      '',
      lastPruneDate.toDate()
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    const branchesBeforePruning = await getBranchesFromGit(repo)
    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesBeforePruning).toEqual(branchesAfterPruning)
  })

  it('Does not prune reserved branches', async () => {
    const fixedDate = moment()
    const lastPruneDate = fixedDate.subtract(1, 'day')
    const repo = await initializeTestRepo(
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate.toDate()
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    const expectedBranchesAfterPruning = [
      'master',
      'gh-pages',
      'develop',
      'dev',
      'development',
      'trunk',
      'devel',
      'release',
    ]

    for (const branch of expectedBranchesAfterPruning) {
      expect(branchesAfterPruning).toContain(branch)
    }
  })
})

async function getBranchesFromGit(repository: Repository) {
  const gitOutput = await GitProcess.exec(['branch'], repository.path)
  return gitOutput.stdout
    .split('\n')
    .filter(s => s.length > 0)
    .map(s => s.substr(2))
}

async function initializeTestRepo(
  repositoriesStore: RepositoriesStore,
  repositoriesStateCache: RepositoryStateCache,
  includesGhRepo: boolean,
  defaultBranchName: string,
  lastPruneDate?: Date
) {
  const path = await setupFixtureRepository('branch-prune-tests')

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
      default_branch: defaultBranchName,
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

  lastPruneDate &&
    repositoriesStore.updateLastPruneDate(repository, lastPruneDate.getTime())
  return repository
}

/**
 * Setup state correctly without having to expose
 * the internals of the GitStore and caches
 */
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
