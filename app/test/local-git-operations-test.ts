import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { LocalGitOperations } from '../src/lib/local-git-operations'
import { FileStatus } from '../src/models/status'

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
      console.log(repository!.path)
    })

    it('returns an empty array when there are no changes', async () => {
      const status = await LocalGitOperations.getStatus(repository!)
      console.log(repository!.path)
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
      expect(commits.length).to.equal(2)
      expect(commits[0].summary).to.equal('Special commit')
    })
  })

  describe('history', () => {
    it('loads history', async () => {
      const commits = await LocalGitOperations.getHistory(repository!)
      expect(commits.length).to.equal(1)
      expect(commits[0].summary).to.equal('first')
      expect(commits[0].sha).to.equal('7cd6640e5b6ca8dbfd0b33d0281ebe702127079c')
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
})
