import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'

describe('BranchPruner', () => {
  let repository: Repository
  let gitStoreCache: GitStoreCache
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: RepositoryStateCache
  let onPruneCompleted: (repository: Repository) => Promise<void>

  beforeEach(() => {})

  it('Does nothing on non GitHub repositories', async () => {
    const branchPruner = new BranchPruner(
      repository,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      onPruneCompleted
    )

    // act
    const a = await branchPruner.start()

    // assert
  })

  it('Prunes for GitHub repository', () => {})

  it('Does not prune if the last prune date is less than 24 hours ago', () => {})

  it('Does not prune if there is no default branch', () => {})
})
