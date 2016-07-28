import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { LocalGitOperations } from '../src/lib/local-git-operations'
import { FileStatus, FileChange } from '../src/models/status'

describe('LocalGitOperations', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoName = 'test-repo'
    const testRepoFixturePath = path.join(__dirname, 'fixtures', testRepoName)
    const testRepoPath = temp.mkdirSync('desktop-git-test-')
    fs.copySync(testRepoFixturePath, testRepoPath)

    fs.renameSync(path.join(testRepoPath, '_git'), path.join(testRepoPath, '.git'))

    repository = new Repository(testRepoPath, null, null)
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

      await LocalGitOperations.createCommit(repository!, 'Special commit', files)

      status = await LocalGitOperations.getStatus(repository!)
      files = status.workingDirectory.files
      expect(files.length).to.equal(0)

      const commits = await LocalGitOperations.getHistory(repository!)
      expect(commits.length).to.equal(6)
      expect(commits[0].summary).to.equal('Special commit')
    })
  })

  describe('history', () => {
    it('loads history', async () => {
      const commits = await LocalGitOperations.getHistory(repository!)
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
      const testRepoName = 'repo-with-changes'
      const testRepoFixturePath = path.join(__dirname, 'fixtures', testRepoName)
      const testRepoPath = temp.mkdirSync('desktop-git-test-')
      fs.copySync(testRepoFixturePath, testRepoPath)

      fs.renameSync(path.join(testRepoPath, '_git'), path.join(testRepoPath, '.git'))

      repository = new Repository(testRepoPath, null, null)
    })

    it('counts lines for new file', async () => {
      const file = new FileChange('new-file.md', FileStatus.New)
      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      expect(diff.lines[0].text).to.have.string('@@ -0,0 +1,33 @@')

      expect(diff.lines[1].text).to.have.string('+Lorem ipsum dolor sit amet,')
      expect(diff.lines[2].text).to.have.string('+ullamcorper sit amet tellus eget, ')

      expect(diff.lines[33].text).to.have.string('+ urna, ac porta justo leo sed magna.')
    })

    it('counts lines for modified file', async () => {
      const file = new FileChange('modified-file.md', FileStatus.Modified)
      const diff = await LocalGitOperations.getDiff(repository!, file, null)

      expect(diff.lines[0].text).to.have.string('@@ -4,10 +4,6 @@')

      expect(diff.lines[4].text).to.have.string('-Aliquam leo ipsum')
      expect(diff.lines[5].text).to.have.string('-nisl eget hendrerit')
      expect(diff.lines[6].text).to.have.string('-eleifend mi.')
      expect(diff.lines[7].text).to.have.string('-')

      expect(diff.lines[12].text).to.have.string('@@ -21,6 +17,10 @@')

      expect(diff.lines[16].text).to.have.string('+Aliquam leo ipsum')
      expect(diff.lines[17].text).to.have.string('+nisl eget hendrerit')
      expect(diff.lines[18].text).to.have.string('+eleifend mi.')
      expect(diff.lines[19].text).to.have.string('+')
    })

    it('counts lines for staged file', async () => {
      const file = new FileChange('staged-file.md', FileStatus.Modified)
      const diff = await LocalGitOperations.getDiff(repository!, file, null)
      // TODO: what to assert?
      expect(diff.lines.length).to.be.greaterThan(0)
    })
  })
})
