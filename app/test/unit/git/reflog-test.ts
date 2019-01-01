import { Repository } from '../../../src/models/repository'
import {
  getBranches,
  getRecentBranches,
  createBranch,
  checkoutBranch,
  renameBranch,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'

async function createAndCheckout(
  repository: Repository,
  name: string
): Promise<void> {
  const branch = await createBranch(repository, name)
  if (branch == null) {
    throw new Error(`Unable to create branch: ${name}`)
  }
  await checkoutBranch(repository, null, branch)
}

describe('git/reflog', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('getRecentBranches', () => {
    it('returns the recently checked out branches', async () => {
      await createAndCheckout(repository!, 'branch-1')
      await createAndCheckout(repository!, 'branch-2')

      const branches = await getRecentBranches(repository!, 10)
      expect(branches).toContain('branch-1')
      expect(branches).toContain('branch-2')
    })

    it('works after renaming a branch', async () => {
      await createAndCheckout(repository!, 'branch-1')
      await createAndCheckout(repository!, 'branch-2')

      const allBranches = await getBranches(repository!)
      const currentBranch = allBranches.find(
        branch => branch.name === 'branch-2'
      )

      await renameBranch(repository!, currentBranch!, 'branch-2-test')

      const branches = await getRecentBranches(repository!, 10)
      expect(branches).not.toContain('master')
      expect(branches).not.toContain('branch-2')
      expect(branches).toContain('branch-1')
      expect(branches).toContain('branch-2-test')
    })

    it('returns a limited number of branches', async () => {
      await createAndCheckout(repository!, 'branch-1')
      await createAndCheckout(repository!, 'branch-2')
      await createAndCheckout(repository!, 'branch-3')
      await createAndCheckout(repository!, 'branch-4')

      const branches = await getRecentBranches(repository!, 2)
      expect(branches.length).toBe(2)
      expect(branches).toContain('branch-4')
      expect(branches).toContain('branch-3')
    })
  })
})
