import * as chai from 'chai'
const expect = chai.expect

import * as path from 'path'

const fs = require('fs-extra')
const temp = require('temp').track()

import Repository from '../src/models/repository'
import { LocalGitOperations } from '../src/lib/local-git-operations'

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
      expect(status.workingDirectory.files.length).to.equal(1)
    })
  })

  describe('committing', () => {

  })

  describe('history', () => {
    describe('changed files', () => {

    })
  })

  describe('config', () => {

  })
})
