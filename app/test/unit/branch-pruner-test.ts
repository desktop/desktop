import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { setupFixtureRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { IGitHubUser } from '../../src/lib/databases'
import { GitProcess } from 'dugite'
import { Branch } from '../../src/models/branch'
import { GitHubRepository } from '../../src/models/github-repository'
import { Owner } from '../../src/models/owner'

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

    const defaultGetUsersFunc = (_: Repository) =>
      new Map<string, IGitHubUser>()
    repositoriesStateCache = new RepositoryStateCache(defaultGetUsersFunc)

    onPruneCompleted = jest.fn(
      () => (repository: Repository, prunedBranches: ReadonlyArray<Branch>) =>
        Promise.resolve()
    )
  })

  it('Does nothing on non GitHub repositories', async () => {
    const path = await setupFixtureRepository('branch-prune-cases')
    const repository = new Repository(path, 0, null, false)
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    let gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesBeforePruning = gitOutput.stdout.split('\n')
    await branchPruner.start()
    gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesAfterPruning = gitOutput.stdout.split('\n')

    expect(branchesBeforePruning.length).toBe(branchesAfterPruning.length)
    for (let i = 0; i < branchesBeforePruning.length; i++) {
      expect(branchesAfterPruning[i]).toBe(branchesAfterPruning[i])
    }
  })

  it('Prunes for GitHub repository', async () => {
    const path = await setupFixtureRepository('branch-prune-cases')
    const ghRepo = new GitHubRepository(
      'branch-prune-test',
      new Owner('', '', null),
      null,
      null,
      null,
      'master',
      null,
      null
    )
    const repository = new Repository(path, 0, ghRepo, false)
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )
    const expectedBranchesForPruning: ReadonlyArray<string> = []

    let gitOutput = await GitProcess.exec(['branch'], repository.path)
    await branchPruner.start()
    gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesAfterPruning = gitOutput.stdout.split('\n')

    expect(onPruneCompleted).toBeCalledWith(
      repository,
      expectedBranchesForPruning
    )
    expect(branchesAfterPruning.length).toBe(expectedBranchesForPruning.length)
    for (let i = 0; i < expectedBranchesForPruning.length; i++) {
      expect(expectedBranchesForPruning[i]).toBe(branchesAfterPruning[i])
    }
  })

  it('Does not prune if the last prune date is less than 24 hours ago', () => {})

  it('Does not prune if there is no default branch', () => {})
})
