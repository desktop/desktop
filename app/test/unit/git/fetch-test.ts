import { Repository } from '../../../src/models/repository'
import { setupFixtureRepository } from '../../helpers/repositories'
import {
  getBranches,
  getBranchesDifferingFromUpstream,
} from '../../../src/lib/git/for-each-ref'
import { Branch } from '../../../src/models/branch'
import { fastForwardBranches } from '../../../src/lib/git'

function branchWithName(branches: ReadonlyArray<Branch>, name: string) {
  return branches.filter(branch => branch.name === name)[0]
}

describe('git/fetch', () => {
  let repository: Repository

  describe('fastForwardBranches', () => {
    beforeEach(async () => {
      const testRepoPath = await setupFixtureRepository(
        'repo-with-non-updated-branches'
      )
      repository = new Repository(testRepoPath, -1, null, false)
    })

    it('fast-forwards branches using fetch', async () => {
      const allBranches = await getBranches(repository)

      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository,
        allBranches
      )

      await fastForwardBranches(repository, eligibleBranches)

      const resultBranches = await getBranches(repository)

      // Only the branch behind was updated to match its upstream
      const branchBehind = branchWithName(resultBranches, 'branch-behind')
      const branchBehindUpstream = branchWithName(
        resultBranches,
        branchBehind.upstream!
      )
      expect(branchBehindUpstream.tip.sha).toBe(branchBehind.tip.sha)

      // The branch ahead is still ahead
      const branchAhead = branchWithName(resultBranches, 'branch-ahead')
      const branchAheadUpstream = branchWithName(
        resultBranches,
        branchAhead.upstream!
      )
      expect(branchAheadUpstream.tip.sha).not.toBe(branchAhead.tip.sha)

      // The branch ahead and behind is still ahead and behind
      const branchAheadAndBehind = branchWithName(
        resultBranches,
        'branch-ahead-and-behind'
      )
      const branchAheadAndBehindUpstream = branchWithName(
        resultBranches,
        branchAheadAndBehind.upstream!
      )
      expect(branchAheadAndBehindUpstream.tip.sha).not.toBe(
        branchAheadAndBehind.tip.sha
      )

      // The master branch hasn't been updated, since it's the current branch
      const masterBranch = branchWithName(resultBranches, 'master')
      const masterUpstream = branchWithName(
        resultBranches,
        masterBranch.upstream!
      )
      expect(masterUpstream.tip.sha).not.toBe(masterBranch.tip.sha)

      // The up-to-date branch is still matching its upstream
      const upToDateBranch = branchWithName(resultBranches, 'up-to-date-branch')
      const upToDateBranchUpstream = branchWithName(
        resultBranches,
        upToDateBranch.upstream!
      )
      expect(upToDateBranchUpstream.tip.sha).toBe(upToDateBranch.tip.sha)
    })
  })
})
