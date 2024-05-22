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
import { GitProcess } from 'dugite'
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
  let repository: Repository

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getRecentBranches', () => {
    it('returns the recently checked out branches', async () => {
      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const branches = await getRecentBranches(repository, 10)
      expect(branches).toContain('branch-1')
      expect(branches).toContain('branch-2')
    })

    it('works after renaming a branch', async () => {
      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const allBranches = await getBranches(repository)
      const currentBranch = allBranches.find(
        branch => branch.name === 'branch-2'
      )

      await renameBranch(repository, currentBranch!, 'branch-2-test')

      const branches = await getRecentBranches(repository, 10)
      expect(branches).not.toContain('branch-2')
      expect(branches).toContain('branch-1')
      expect(branches).toContain('branch-2-test')
    })

    it('returns a limited number of branches', async () => {
      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')
      await createAndCheckout(repository, 'branch-3')
      await createAndCheckout(repository, 'branch-4')

      const branches = await getRecentBranches(repository, 2)
      expect(branches).toHaveLength(2)
      expect(branches).toContain('branch-4')
      expect(branches).toContain('branch-3')
    })
  })

  describe('getBranchCheckouts', () => {
    it('returns does not return the branches that were checked out before a specific date', async () => {
      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const branches = await getBranchCheckouts(
        repository,
        new Date(offsetFromNow(1, 'day'))
      )
      expect(branches.size).toBe(0)
    })

    it('returns all branches checked out after a specific date', async () => {
      await createBranch(repository, 'never-checked-out', null)
      await createAndCheckout(repository, 'branch-1')
      await createAndCheckout(repository, 'branch-2')

      const branches = await getBranchCheckouts(
        repository,
        new Date(offsetFromNow(-1, 'hour'))
      )
      expect(branches.size).toBe(2)
    })

    it('returns empty when current branch is orphaned', async () => {
      const result = await GitProcess.exec(
        ['checkout', '--orphan', 'orphan-branch'],
        repository.path
      )
      expect(result.exitCode).toBe(0)

      const branches = await getBranchCheckouts(
        repository,
        new Date(offsetFromNow(-1, 'hour'))
      )
      expect(branches.size).toBe(0)
    })
  })
})
