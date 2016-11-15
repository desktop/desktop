import * as chai from 'chai'
const expect = chai.expect

const temp = require('temp').track()

import { Repository } from '../../src/models/repository'
import { getCommits, getChangedFiles } from '../../src/lib/git/log'
import { getBranches, getCurrentBranch } from '../../src/lib/git'
import { FileStatus } from '../../src/models/status'
import { BranchType } from '../../src/models/branch'
import { setupFixtureRepository, setupEmptyRepository } from '../fixture-helper'

import { GitProcess } from 'git-kitchen-sink'

describe('LocalGitOperations', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('history', () => {
    it('loads history', async () => {
      const commits = await getCommits(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(5)

      const firstCommit = commits[commits.length - 1]
      expect(firstCommit.summary).to.equal('first')
      expect(firstCommit.sha).to.equal('7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
    })

    describe('changed files', () => {
      it('loads the files changed in the commit', async () => {
        const files = await getChangedFiles(repository!, '7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
        expect(files.length).to.equal(1)
        expect(files[0].path).to.equal('README.md')
        expect(files[0].status).to.equal(FileStatus.New)
      })

      it('detects renames', async () => {
        const testRepoPath = setupFixtureRepository('rename-history-detection')
        repository = new Repository(testRepoPath, -1, null)

        const first = await getChangedFiles(repository, '55bdecb')
        expect(first.length).to.equal(1)
        expect(first[0].status).to.equal(FileStatus.Renamed)
        expect(first[0].oldPath).to.equal('NEW.md')
        expect(first[0].path).to.equal('NEWER.md')

        const second = await getChangedFiles(repository, 'c898ca8')
        expect(second.length).to.equal(1)
        expect(second[0].status).to.equal(FileStatus.Renamed)
        expect(second[0].oldPath).to.equal('OLD.md')
        expect(second[0].path).to.equal('NEW.md')
      })

      it('detect copies', async () => {
        const testRepoPath = setupFixtureRepository('copies-history-detection')
        repository = new Repository(testRepoPath, -1, null)

        // ensure the test repository is configured to detect copies
        await GitProcess.exec([ 'config', 'diff.renames', 'copies' ], repository.path)

        const files = await getChangedFiles(repository, 'a500bf415')
        expect(files.length).to.equal(2)

        expect(files[0].status).to.equal(FileStatus.Copied)
        expect(files[0].oldPath).to.equal('initial.md')
        expect(files[0].path).to.equal('duplicate-with-edits.md')

        expect(files[1].status).to.equal(FileStatus.Copied)
        expect(files[1].oldPath).to.equal('initial.md')
        expect(files[1].path).to.equal('duplicate.md')
      })
    })
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
