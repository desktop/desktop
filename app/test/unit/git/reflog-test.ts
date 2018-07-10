import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import {
  getRecentBranches,
  createBranch,
  checkoutBranch,
  renameBranch,
} from '../../../src/lib/git'
import { setupFixtureRepository } from '../../helpers/repositories'
import { Branch, BranchType } from '../../../src/models/branch'
import { Commit } from '../../../src/models/commit'
import { CommitIdentity } from '../../../src/models/commit-identity'

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
      expect(branches).to.contain('branch-1')
      expect(branches).to.contain('branch-2')
    })

    it('works after renaming a branch', async () => {
      await createAndCheckout(repository!, 'branch-1')
      await createAndCheckout(repository!, 'branch-2')

      await renameBranch(
        repository!,
        new Branch(
          'branch-1',
          null,
          new Commit(
            '',
            '',
            '',
            new CommitIdentity('', '', new Date()),
            new CommitIdentity('', '', new Date()),
            [],
            []
          ),
          BranchType.Local
        ),
        'branch-1-test'
      )

      const branches = await getRecentBranches(repository!, 10)
      expect(branches).to.contain('branch-1')
      expect(branches).to.contain('branch-2')
    })
  })
})
