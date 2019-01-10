import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { setupEmptyRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { IGitHubUser } from '../../src/lib/databases'

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
    const repository = await setupEmptyRepository()
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )
    const refs: ReadonlyArray<string> = []

    // act
    await branchPruner.start()

    // assert
    const refsAfterPruning: ReadonlyArray<string> = []
    // Todo figure out a better way to compare arrays for eq
    for (const ref of refs) {
      expect(refsAfterPruning).toContain(ref)
    }
  })

  it('Prunes for GitHub repository', async () => {
    const repository = await setupEmptyRepository()
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
