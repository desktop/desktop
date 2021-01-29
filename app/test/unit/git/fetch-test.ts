import { Repository } from '../../../src/models/repository'
import { setupFixtureRepository } from '../../helpers/repositories'
import {
  getBranches,
  getBranchesDifferingFromUpstream,
} from '../../../src/lib/git/for-each-ref'
import { Branch } from '../../../src/models/branch'
import { fastForwardBranches } from '../../../src/lib/git'
import * as Path from 'path'
import * as FSE from 'fs-extra'

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
      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
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

      // The main branch hasn't been updated, since it's the current branch
      const mainBranch = branchWithName(resultBranches, 'main')
      const mainUpstream = branchWithName(resultBranches, mainBranch.upstream!)
      expect(mainUpstream.tip.sha).not.toBe(mainBranch.tip.sha)

      // The up-to-date branch is still matching its upstream
      const upToDateBranch = branchWithName(resultBranches, 'branch-up-to-date')
      const upToDateBranchUpstream = branchWithName(
        resultBranches,
        upToDateBranch.upstream!
      )
      expect(upToDateBranchUpstream.tip.sha).toBe(upToDateBranch.tip.sha)
    })

    // We want to avoid messing with the FETCH_HEAD file. Normally, it shouldn't
    // be something users would rely on, but we want to be good gitizens
    // (:badpundog:) when possible.
    it('does not change FETCH_HEAD after fast-forwarding branches with fetch', async () => {
      const eligibleBranches = await getBranchesDifferingFromUpstream(
        repository
      )

      const fetchHeadPath = Path.join(repository.path, '.git', 'FETCH_HEAD')
      const previousFetchHead = await FSE.readFile(fetchHeadPath, 'utf-8')

      await fastForwardBranches(repository, eligibleBranches)

      const currentFetchHead = await FSE.readFile(fetchHeadPath, 'utf-8')

      expect(currentFetchHead).toBe(previousFetchHead)
    })
  })
})
