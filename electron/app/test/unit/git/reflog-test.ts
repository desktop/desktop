import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../../src/models/repository'
import {
  getBranches,
  getRecentBranches,
  createBranch,
  checkoutBranch,
  renameBranch,
  getBranchCheckouts,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import { exec } from 'dugite'
import { offsetFromNow } from '../../../src/lib/offset-from'

async function createAndCheckout(
  repository: Repository,
  name: string
): Promise<void> {
  await createBranch(repository, name, null)
  const [branch] = await getBranches(repository, `refs/heads/${name}`)
  if (branch === undefined) {
    throw new Error(`Unable to create branch: ${name}`)
  }
  await checkoutBranch(repository, branch, null)
}

describe('git/reflog', () => {
  describe('getRecentBranches', () => {
    it('returns the recently checked out branches', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const branches = await getRecentBranches(repository, 10)
      assert(branches.includes('branch-1'))
      assert(branches.includes('branch-2'))
    })

    it('works after renaming a branch', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const allBranches = await getBranches(repository)
      const currentBranch = allBranches.find(
        branch => branch.name === 'branch-2'
      )

      assert(currentBranch !== undefined)
      await renameBranch(repository, currentBranch, 'branch-2-test')

      const branches = await getRecentBranches(repository, 10)
      assert(!branches.includes('branch-2'))
      assert(branches.includes('branch-1'))
      assert(branches.includes('branch-2-test'))
    })

    it('returns a limited number of branches', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')
      await createAndCheckout(repository, 'branch-3')
      await createAndCheckout(repository, 'branch-4')

      const branches = await getRecentBranches(repository, 2)
      assert.equal(branches.length, 2)
      assert(branches.includes('branch-4'))
      assert(branches.includes('branch-3'))
    })
  })

  describe('getBranchCheckouts', () => {
    it('returns does not return the branches that were checked out before a specific date', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const branches = await getBranchCheckouts(
        repository,
        new Date(offsetFromNow(1, 'day'))
      )
      assert.equal(branches.size, 0)
    })

    it('returns all branches checked out after a specific date', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      await createBranch(repository, 'never-checked-out', null)
      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const branches = await getBranchCheckouts(
        repository,
        new Date(offsetFromNow(-1, 'hour'))
      )
      assert.equal(branches.size, 2)
    })

    it('returns empty when current branch is orphaned', async t => {
      const testRepoPath = await setupFixtureRepository(t, 'test-repo')
      const repository = new Repository(testRepoPath, -1, null, false)

      const result = await exec(
        ['checkout', '--orphan', 'orphan-branch'],
        repository.path
      )
      assert.equal(result.exitCode, 0)

      const branches = await getBranchCheckouts(
        repository,
        new Date(offsetFromNow(-1, 'hour'))
      )
      assert.equal(branches.size, 0)
    })
  })
})
