import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
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
import { TestStatsStore } from '../helpers/test-stats-store'
import { offsetFromNow } from '../../src/lib/offset-from'
import { unlink } from 'fs/promises'
import * as path from 'path'
import noop from 'lodash/noop'

describe('BranchPruner', () => {
  let gitStoreCache: GitStoreCache
  let repositoriesDb: TestRepositoriesDatabase
  let repositoriesStore: RepositoriesStore
  let repositoriesStateCache: RepositoryStateCache

  beforeEach(async () => {
    const statsStore = new TestStatsStore()
    gitStoreCache = new GitStoreCache(shell, statsStore, noop, noop)
    repositoriesDb = new TestRepositoriesDatabase()
    repositoriesStore = new RepositoriesStore(repositoriesDb)
    repositoriesStateCache = new RepositoryStateCache(statsStore)
  })

  afterEach(() => repositoriesDb.delete())

  it('does nothing on non GitHub repositories', async t => {
    const path = await setupFixtureRepository(t, 'branch-prune-tests')

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
    await branchPruner.runOnce()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    assert.deepStrictEqual(branchesBeforePruning, branchesAfterPruning)
  })

  it('prunes for GitHub repository', async t => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))

    const path = await setupFixtureRepository(t, 'branch-prune-tests')
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

    await branchPruner.runOnce()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    assert(!branchesAfterPruning.includes('deleted-branch-1'))
    assert(branchesAfterPruning.includes('not-deleted-branch-1'))
  })

  it('does not prune if the last prune date is less than 24 hours ago', async t => {
    const lastPruneDate = new Date(offsetFromNow(-4, 'hours'))
    const path = await setupFixtureRepository(t, 'branch-prune-tests')
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
    await branchPruner.runOnce()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    assert.deepStrictEqual(branchesBeforePruning, branchesAfterPruning)
  })

  it('does not prune if there is no default branch', async t => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))
    const repoPath = await setupFixtureRepository(t, 'branch-prune-tests')
    unlink(path.join(repoPath, '.git', 'refs', 'remotes', 'origin', 'HEAD'))

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
    await branchPruner.runOnce()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    assert.deepStrictEqual(branchesBeforePruning, branchesAfterPruning)
  })

  it('does not prune reserved branches', async t => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))

    const path = await setupFixtureRepository(t, 'branch-prune-tests')
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

    await branchPruner.runOnce()
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
      assert(branchesAfterPruning.includes(branch))
    }
  })

  it('never prunes a branch that lacks an upstream', async t => {
    const path = await createPrunedRepository(t)

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

    await branchPruner.runOnce()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    assert(branchesAfterPruning.includes('master'))
    assert(branchesAfterPruning.includes('other-branch'))
  })

  it('does not prune branches checked out in a linked worktree', async t => {
    const lastPruneDate = new Date(offsetFromNow(-1, 'day'))

    const repoPath = await setupFixtureRepository(t, 'branch-prune-tests')

    // Create a linked worktree with `deleted-branch-1` checked out.
    // This branch would normally be pruned (merged, upstream gone),
    // but the worktree checkout should protect it.
    const worktreePath = repoPath + '-worktree'
    await exec(['worktree', 'add', worktreePath, 'deleted-branch-1'], repoPath)

    const repo = await setupRepository(
      repoPath,
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

    await branchPruner.runOnce()
    const branchesAfterPruning = await getBranchesFromGit(repo)

    assert(
      branchesAfterPruning.includes('deleted-branch-1'),
      'expected deleted-branch-1 to be preserved because it is checked out in a linked worktree'
    )
  })
})

async function getBranchesFromGit(repository: Repository) {
  const gitOutput = await exec(['branch'], repository.path)
  return gitOutput.stdout
    .split('\n')
    .filter(s => s.length > 0)
    .map(s => s.substring(2))
}
