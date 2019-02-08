import { Repository } from '../../../src/models/repository'
import {
  getBranches,
  getRecentBranches,
  createBranch,
  checkoutBranch,
  renameBranch,
  getCheckoutsAfterDate,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import moment = require('moment')

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
      expect(branches).not.toContain('master')
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

  describe('getCheckoutsAfterDate', () => {
    it('returns does not return the branches that were checked out before a specific date', async () => {
      await createAndCheckout(repository!, 'branch-1')
      await createAndCheckout(repository!, 'branch-2')

      const branches = await getCheckoutsAfterDate(
        repository!,
        moment()
          .add(1, 'day')
          .toDate()
      )
      expect(branches.size).toBe(0)
    })

    it('returns all branches checked out after a specific date', async () => {
      await createBranch(repository!, 'never-checked-out')
      await createAndCheckout(repository!, 'branch-1')
      await createAndCheckout(repository!, 'branch-2')

      const branches = await getCheckoutsAfterDate(
        repository!,
        moment()
          .subtract(1, 'hour')
          .toDate()
      )
      expect(branches.size).toBe(2)
    })
  })
})
