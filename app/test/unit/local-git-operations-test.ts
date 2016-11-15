import * as chai from 'chai'
const expect = chai.expect

const temp = require('temp').track()

import { Repository } from '../../src/models/repository'
import { getBranches, getCurrentBranch } from '../../src/lib/git'
import { BranchType } from '../../src/models/branch'
import { setupFixtureRepository, setupEmptyRepository } from '../fixture-helper'

describe('LocalGitOperations', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('branches', () => {
    describe('current branch', () => {
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

    describe('all branches', () => {
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
  })
})
