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

describe.only('BranchPruner', () => {
  const onGitStoreUpdated = () => {}
  const onDidLoadNewCommits = () => {}
  const onDidError = () => {}

  let gitStoreCache: GitStoreCache
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: RepositoryStateCache
  let onPruneCompleted: (repository: Repository) => Promise<void>

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

    onPruneCompleted = (_: Repository) => Promise.resolve()
  })

  it.only('Does nothing on non GitHub repositories', async () => {
    const path = await setupFixtureRepository('branch-prune-cases')
    const repository = new Repository(path, 0, null, false)
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    // act
    let gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesBeforePruning = gitOutput.stdout.split('\n')
    await branchPruner.start()

    // assert
    gitOutput = await GitProcess.exec(['branch'], repository.path)
    const branchesAfterPruning = gitOutput.stdout.split('\n')

    // Todo figure out a better way to compare arrays for eq
    for (const branch of branchesBeforePruning) {
      expect(branchesAfterPruning).toContain(branch)
    }
  })

  it('Prunes for GitHub repository', async () => {
    const path = await setupFixtureRepository('branch-prune-cases')
    const repository = new Repository(path, 0, null, false)
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )
    const expectedBranchesForPruning: ReadonlyArray<string> = []

    // act
    await branchPruner.start()

    // assert
    const refsAfterPruning: ReadonlyArray<string> = []
    expect(expectedBranchesForPruning.length).toBe(refsAfterPruning.length)
    for (const ref of expectedBranchesForPruning) {
      expect(refsAfterPruning).not.toContain(ref)
    }
  })

  it('Does not prune if the last prune date is less than 24 hours ago', () => {})

  it('Does not prune if there is no default branch', () => {})
})
