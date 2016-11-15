import { expect, use as chaiUse } from 'chai'
import { Repository } from '../../../src/models/repository'
import { setupFixtureRepository, setupEmptyRepository } from '../../fixture-helper'
import { getBranches, getCurrentBranch } from '../../../src/lib/git/for-each-ref'
import { BranchType } from '../../../src/models/branch'

chaiUse(require('chai-datetime'))

describe('git/for-each-ref', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('repo-with-many-refs')
    repository = new Repository(testRepoPath, -1, null)
  })

  describe('getBranches', () => {
    it('fetches branches using for-each-ref', async () => {
      const branches = await getBranches(repository!, 'refs/heads', BranchType.Local)

      expect(branches.length).to.equal(3)

      const commitWithBody = branches[0]
      expect(commitWithBody.name).to.equal('commit-with-long-description')
      expect(commitWithBody.upstream).to.be.null
      expect(commitWithBody.tip.sha).to.equal('dfa96676b65e1c0ed43ca25492252a5e384c8efd')
      expect(commitWithBody.tip.summary).to.equal('this is a commit title')
      expect(commitWithBody.tip.body).to.contain('lucky last')
      expect(commitWithBody.tip.parentSHAs.length).to.equal(1)

      const commitNoBody = branches[1]
      expect(commitNoBody.name).to.equal('commit-with-no-body')
      expect(commitNoBody.upstream).to.be.null
      expect(commitNoBody.tip.sha).to.equal('49ec1e05f39eef8d1ab6200331a028fb3dd96828')
      expect(commitNoBody.tip.summary).to.equal('this is a commit title')
      expect(commitNoBody.tip.body.length).to.equal(0)
      expect(commitNoBody.tip.parentSHAs.length).to.equal(1)

      const master = branches[2]
      expect(master.name).to.equal('master')
      expect(master.upstream).to.be.null
      expect(master.tip.sha).to.equal('b9ccfc3307240b86447bca2bd6c51a4bb4ade493')
      expect(master.tip.summary).to.equal('stubbed a README')
      expect(master.tip.parentSHAs.length).to.equal(1)
    })

    it('should list all branches', async () => {
      const branches = await getBranches(repository!, 'refs/heads', BranchType.Local)
      expect(branches.length).to.equal(1)
      expect(branches[0].name).to.equal('master')
      expect(branches[0].upstream).to.equal(null)
      expect(branches[0].type).to.equal(BranchType.Local)
      expect(branches[0].tip.sha).to.equal('04c7629c588c74659f03dda5e5fb3dd8d6862dfa')
    })

    it('should return empty list for empty repo', async () => {
      const repo = await setupEmptyRepository()
      const branches = await getBranches(repo, '', BranchType.Local)
      expect(branches.length).to.equal(0)
    })
  })

  describe('getCurrentBranch', () => {
    it('fetches branch using for-each-ref', async () => {
      const currentBranch = await getCurrentBranch(repository!)

      expect(currentBranch!.name).to.equal('commit-with-long-description')
      expect(currentBranch!.upstream).to.be.null
      expect(currentBranch!.tip.sha).to.equal('dfa96676b65e1c0ed43ca25492252a5e384c8efd')
      expect(currentBranch!.tip.summary).to.equal('this is a commit title')
      expect(currentBranch!.tip.body).to.contain('lucky last')
      expect(currentBranch!.tip.authorName).to.equal('Brendan Forster')
      expect(currentBranch!.tip.authorEmail).to.equal('brendan@github.com')
      const date = currentBranch!.tip.authorDate
      expect(date).to.equalDate(new Date('Tue Oct 18 16:23:42 2016 +1100'))

      expect(currentBranch!.tip.parentSHAs.length).to.equal(1)
    })

    it('should get the current branch', async () => {
      const branch = await getCurrentBranch(repository!)
      expect(branch!.name).to.equal('master')
      expect(branch!.upstream).to.equal(null)
      expect(branch!.tip).to.be.not.null
      expect(branch!.tip.sha).to.equal('04c7629c588c74659f03dda5e5fb3dd8d6862dfa')
      expect(branch!.type).to.equal(BranchType.Local)
    })

    it('should return null for empty repo', async () => {
      const repo = await setupEmptyRepository()
      const branch = await getCurrentBranch(repo)
      expect(branch).to.be.null
    })
  })
})
