import { BranchPruner } from '../../src/lib/stores/helpers/branch-pruner'
import { Repository } from '../../src/models/repository'
import { GitStoreCache } from '../../src/lib/stores/git-store-cache'
import { RepositoriesStore } from '../../src/lib/stores'
import { RepositoryStateCache } from '../../src/lib/stores/repository-state-cache'
import { setupFixtureRepository } from '../helpers/repositories'
import { shell } from '../helpers/test-app-shell'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { exec } from 'dugite'
import {
  createRepository as createPrunedRepository,
  setupRepository,
} from '../helpers/repository-builder-branch-pruner'
import { StatsStore, StatsDatabase } from '../../src/lib/stats'
import { UiActivityMonitor } from '../../src/ui/lib/ui-activity-monitor'
import { offsetFromNow } from '../../src/lib/offset-from'
import * as FSE from 'fs-extra'
import * as path from 'path'
import { fakePost } from '../fake-stats-post'

describe('BranchPruner', () => {
  const onGitStoreUpdated = () => {}
  const onDidError = () => {}

  let gitStoreCache: GitStoreCache
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: RepositoryStateCache

  beforeEach(async () => {
    const statsStore = new StatsStore(
      new StatsDatabase('test-StatsDatabase'),
      new UiActivityMonitor(),
      fakePost
    )
    gitStoreCache = new GitStoreCache(
      shell,
      statsStore,
      onGitStoreUpdated,
      onDidError
    )

    const repositoriesDb = new TestRepositoriesDatabase()
    await repositoriesDb.reset()
    repositoriesStore = new RepositoriesStore(repositoriesDb)
    repositoriesStateCache = new RepositoryStateCache(statsStore)
  })

  it('does nothing on non GitHub repositories', async () => {
    const path = await setupFixtureRepository('branch-prune-tests')

    const repo = await setupRepository(
      path,
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
      () => Promise.resolve()
    )

    const branchesBeforePruning = await getBranchesFromGit(repo)
    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesBeforePruning).toEqual(branchesAfterPruning)
  })

  it('prunes for GitHub repository', async () => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))

    const path = await setupFixtureRepository('branch-prune-tests')
    const repo = await setupRepository(
      path,
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      () => Promise.resolve()
    )

    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesAfterPruning).not.toContain('deleted-branch-1')
    expect(branchesAfterPruning).toContain('not-deleted-branch-1')
  })

  it('does not prune if the last prune date is less than 24 hours ago', async () => {
    const lastPruneDate = new Date(offsetFromNow(-4, 'hours'))
    const path = await setupFixtureRepository('branch-prune-tests')
    const repo = await setupRepository(
      path,
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      () => Promise.resolve()
    )

    const branchesBeforePruning = await getBranchesFromGit(repo)
    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesBeforePruning).toEqual(branchesAfterPruning)
  })

  it('does not prune if there is no default branch', async () => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))
    const repoPath = await setupFixtureRepository('branch-prune-tests')
    FSE.unlink(path.join(repoPath, '.git', 'refs', 'remotes', 'origin', 'HEAD'))

    const repo = await setupRepository(
      repoPath,
      repositoriesStore,
      repositoriesStateCache,
      true,
      '',
      lastPruneDate
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      () => Promise.resolve()
    )

    const branchesBeforePruning = await getBranchesFromGit(repo)
    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesBeforePruning).toEqual(branchesAfterPruning)
  })

  it('does not prune reserved branches', async () => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))

    const path = await setupFixtureRepository('branch-prune-tests')
    const repo = await setupRepository(
      path,
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate
    )
    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      () => Promise.resolve()
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

  it('never prunes a branch that lacks an upstream', async () => {
    const path = await createPrunedRepository()

    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))

    const repo = await setupRepository(
      path,
      repositoriesStore,
      repositoriesStateCache,
      true,
      'master',
      lastPruneDate
    )

    const branchPruner = new BranchPruner(
      repo,
      gitStoreCache,
      repositoriesStore,
      repositoriesStateCache,
      () => Promise.resolve()
    )

    await branchPruner.start()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    expect(branchesAfterPruning).toContain('master')
    expect(branchesAfterPruning).toContain('other-branch')
  })
})

async function getBranchesFromGit(repository: Repository) {
  const gitOutput = await exec(['branch'], repository.path)
  return gitOutput.stdout
    .split('\n')
    .filter(s => s.length > 0)
    .map(s => s.substring(2))
}
