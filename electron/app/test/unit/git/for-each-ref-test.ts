import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Repository } from '../../../src/models/repository'
import {
  setupFixtureRepository,
  setupEmptyRepository,
  setupEmptyDirectory,
} from '../../helpers/repositories'
import {
  getBranches,
  getBranchesDifferingFromUpstream,
} from '../../../src/lib/git/for-each-ref'
import { BranchType } from '../../../src/models/branch'

describe('git/for-each-ref', () => {
  describe('getBranches', () => {
    it('fetches branches using for-each-ref', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-many-refs'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const branches = (await getBranches(repository)).filter(
        b => b.type === BranchType.Local
      )

      assert.equal(branches.length, 3)

      const commitWithBody = branches[0]
      assert.equal(commitWithBody.name, 'commit-with-long-description')
      assert(commitWithBody.upstream === null)
      assert.equal(
        commitWithBody.tip.sha,
        'dfa96676b65e1c0ed43ca25492252a5e384c8efd'
      )

      const commitNoBody = branches[1]
      assert.equal(commitNoBody.name, 'commit-with-no-body')
      assert(commitNoBody.upstream === null)
      assert.equal(
        commitNoBody.tip.sha,
        '49ec1e05f39eef8d1ab6200331a028fb3dd96828'
      )

      const master = branches[2]
      assert.equal(master.name, 'master')
      assert(master.upstream === null)
      assert.equal(master.tip.sha, 'b9ccfc3307240b86447bca2bd6c51a4bb4ade493')
    })

    it('should return empty list for empty repo', async t => {
      const repo = await setupEmptyRepository(t)
      const branches = await getBranches(repo)
      assert.equal(branches.length, 0)
    })

    it('should return empty list for directory without a .git directory', async t => {
      const repo = await setupEmptyDirectory(t)
      const status = await getBranches(repo)
      assert.equal(status.length, 0)
    })
  })

  describe('getBranchesDifferingFromUpstream', () => {
    it('filters branches differing from upstream using for-each-ref', async t => {
      const testRepoPath = await setupFixtureRepository(
        t,
        'repo-with-non-updated-branches'
      )
      const repository = new Repository(testRepoPath, -1, null, false)

      const branches = await getBranchesDifferingFromUpstream(repository)

      const branchRefs = branches.map(branch => branch.ref)
      assert.equal(branchRefs.length, 3)

      // All branches that are behind and/or ahead must be included
      assert(branchRefs.includes('refs/heads/branch-behind'))
      assert(branchRefs.includes('refs/heads/branch-ahead'))
      assert(branchRefs.includes('refs/heads/branch-ahead-and-behind'))

      // `main` is the current branch, and shouldn't be included
      assert(!branchRefs.includes('refs/heads/main'))

      // Branches that are up to date shouldn't be included
      assert(!branchRefs.includes('refs/heads/branch-up-to-date'))
    })
  })
})
