import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { LocalGitOperations, BranchType } from '../src/lib/local-git-operations'
import { FileStatus, FileChange,  DiffSelection, WorkingDirectoryFileChange } from '../src/models/status'

import { find } from '../src/lib/find'

describe('LocalGitOperations', () => {
  let repository: Repository | null = null

  function setupTestRepository(repositoryName: string): string {
    const testRepoFixturePath = path.join(__dirname, 'fixtures', repositoryName)
    const testRepoPath = temp.mkdirSync('desktop-git-test-')
    fs.copySync(testRepoFixturePath, testRepoPath)

    fs.renameSync(path.join(testRepoPath, '_git'), path.join(testRepoPath, '.git'))

    return testRepoPath
  }

  beforeEach(() => {
    const testRepoPath = setupTestRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('status', () => {
    it('parses changed files', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      const status = await LocalGitOperations.getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      const file = files[0]
      expect(file.path).to.equal('README.md')
      expect(file.status).to.equal(FileStatus.Modified)
    })

    it('returns an empty array when there are no changes', async () => {
      const status = await LocalGitOperations.getStatus(repository!)
      const files = status.workingDirectory.files
      expect(files.length).to.equal(0)
    })
  })

  describe('committing', () => {
    it('commits the given files', async () => {
      fs.writeFileSync(path.join(repository!.path, 'README.md'), 'Hi world\n')

      let status = await LocalGitOperations.getStatus(repository!)
      let files = status.workingDirectory.files
      expect(files.length).to.equal(1)

      await LocalGitOperations.createCommit(repository!, 'Special commit', '', files)

      status = await LocalGitOperations.getStatus(repository!)
      files = status.workingDirectory.files
      expect(files.length).to.equal(0)

      const commits = await LocalGitOperations.getHistory(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(6)
      expect(commits[0].summary).to.equal('Special commit')
    })
  })

  describe('partial commits', () => {

    beforeEach(() => {
      const testRepoPath = setupTestRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null)
    })

    it('can commit some lines from new file', async () => {

      const previousTip = (await LocalGitOperations.getHistory(repository!, 'HEAD', 1))[0]

      const lines = new Map<number, boolean>()

      for (let i = 0; i < 33; i++) {
        lines.set(i, (i < 6))
      }

      // select first few lines
      const newFileName = 'new-file.md'
      const selectedLines = new Map<number, boolean>(lines)
      const selection = new DiffSelection(null, selectedLines)
      const file = new WorkingDirectoryFileChange(newFileName, FileStatus.New, selection)

      // commit just this change, ignore everything else
      await LocalGitOperations.createCommit(repository!, 'title', '', [ file ])

      // verify that the HEAD of the repository has moved
      const newTip = (await LocalGitOperations.getHistory(repository!, 'HEAD', 1))[0]
      expect(newTip.sha).to.not.equal(previousTip.sha)
      expect(newTip.summary).to.equal('title')

      // verify that the contents of this new commit are just the new file
      const changedFiles = await LocalGitOperations.getChangedFiles(repository!, newTip.sha)
      expect(changedFiles.length).to.equal(1)
      expect(changedFiles[0].path).to.equal(newFileName)

      // verify that changes remain for this new file
      const status = await LocalGitOperations.getStatus(repository!)
      expect(status.workingDirectory.files.length).to.equal(3)

      // verify that the file is now tracked
      const fileChange = find(status.workingDirectory.files, f => f.path === newFileName)
      expect(fileChange).to.not.be.undefined
      expect(fileChange!.status).to.equal(FileStatus.Modified)
    })
  })

  describe('history', () => {
    it('loads history', async () => {
      const commits = await LocalGitOperations.getHistory(repository!, 'HEAD', 100)
      expect(commits.length).to.equal(5)

      const firstCommit = commits[commits.length - 1]
      expect(firstCommit.summary).to.equal('first')
      expect(firstCommit.sha).to.equal('7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
    })

    describe('changed files', () => {
      it('loads the files changed in the commit', async () => {
        const files = await LocalGitOperations.getChangedFiles(repository!, '7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
        expect(files.length).to.equal(1)
        expect(files[0].path).to.equal('README.md')
        expect(files[0].status).to.equal(FileStatus.New)
      })
    })
  })

  describe('config', () => {
    it('looks up config values', async () => {
      const bare = await LocalGitOperations.getConfigValue(repository!, 'core.bare')
      expect(bare).to.equal('false')
    })

    it('returns null for undefined values', async () => {
      const value = await LocalGitOperations.getConfigValue(repository!, 'core.the-meaning-of-life')
      expect(value).to.equal(null)
    })
  })

  describe('diff', () => {

    beforeEach(() => {
      const testRepoPath = setupTestRepository('repo-with-changes')
      repository = new Repository(testRepoPath, -1, null)
    })

    it('counts lines for new file', async () => {
      const file = new FileChange('new-file.md', FileStatus.New)
      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      const section = diff.sections[0]

      expect(section.lines[0].text).to.have.string('@@ -0,0 +1,33 @@')

      expect(section.lines[1].text).to.have.string('+Lorem ipsum dolor sit amet,')
      expect(section.lines[2].text).to.have.string('+ullamcorper sit amet tellus eget, ')

      expect(section.lines[33].text).to.have.string('+ urna, ac porta justo leo sed magna.')
    })

    it('counts lines for modified file', async () => {
      const file = new FileChange('modified-file.md', FileStatus.Modified)
      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      const first = diff.sections[0]
      expect(first.lines[0].text).to.have.string('@@ -4,10 +4,6 @@')

      expect(first.lines[4].text).to.have.string('-Aliquam leo ipsum')
      expect(first.lines[5].text).to.have.string('-nisl eget hendrerit')
      expect(first.lines[6].text).to.have.string('-eleifend mi.')
      expect(first.lines[7].text).to.have.string('-')

      const second = diff.sections[1]
      expect(second.lines[0].text).to.have.string('@@ -21,6 +17,10 @@')

      expect(second.lines[4].text).to.have.string('+Aliquam leo ipsum')
      expect(second.lines[5].text).to.have.string('+nisl eget hendrerit')
      expect(second.lines[6].text).to.have.string('+eleifend mi.')
      expect(second.lines[7].text).to.have.string('+')
    })

    it('counts lines for staged file', async () => {
      const file = new FileChange('staged-file.md', FileStatus.Modified)
      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      const first = diff.sections[0]
      expect(first.lines[0].text).to.have.string('@@ -2,7 +2,7 @@ ')

      expect(first.lines[4].text).to.have.string('-tortor placerat facilisis. Ut sed ex tortor. Duis consectetur at ex vel mattis.')
      expect(first.lines[5].text).to.have.string('+tortor placerat facilisis.')

      const second = diff.sections[1]
      expect(second.lines[0].text).to.have.string('@@ -17,9 +17,7 @@ ')

      expect(second.lines[4].text).to.have.string('-vel sagittis nisl rutrum. ')
      expect(second.lines[5].text).to.have.string('-tempor a ligula. Proin pretium ipsum ')
      expect(second.lines[6].text).to.have.string('-elementum neque id tellus gravida rhoncus.')
      expect(second.lines[7].text).to.have.string('+vel sagittis nisl rutrum.')
    })
  })

  describe('branches', () => {
    describe('current branch', () => {
      it('should get the current branch', async () => {
        const branch = await LocalGitOperations.getCurrentBranch(repository!)
        expect(branch!.name).to.equal('master')
        expect(branch!.sha).to.equal('04c7629c588c74659f03dda5e5fb3dd8d6862dfa')
        expect(branch!.upstream).to.equal(null)
        expect(branch!.type).to.equal(BranchType.Local)
      })
    })

    describe('all branches', () => {
      it('should list all branches', async () => {
        const branches = await LocalGitOperations.getBranches(repository!, 'refs/heads', BranchType.Local)
        expect(branches.length).to.equal(1)
        expect(branches[0].name).to.equal('master')
        expect(branches[0].sha).to.equal('04c7629c588c74659f03dda5e5fb3dd8d6862dfa')
        expect(branches[0].upstream).to.equal(null)
        expect(branches[0].type).to.equal(BranchType.Local)
      })
    })
  })
})
