/* tslint:disable:no-sync-functions */

import * as Fs from 'fs'
import * as Path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { removeFromIndex } from '../../../src/lib/git'
import { setupFixtureRepository, setupEmptyRepository } from '../../fixture-helper'

import { GitProcess } from 'dugite'

const temp = require('temp').track()

describe('git/rm', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('removeFromIndex', () => {
    it('should not throw for a file that is not in the index', async () => {
      const testFileName = 'test-file.txt'
      Fs.writeFileSync(Path.join(repository!.path, testFileName), '')

      const result = await removeFromIndex(repository!, testFileName)
      expect(result.exitCode).to.equal(128)
    })

    it('should remove the file from the index', async () => {
      const testFileName = 'README.md'
      Fs.writeFileSync(Path.join(repository!.path, testFileName), `I'm just a bill`)

      const result = await removeFromIndex(repository!, testFileName)
      expect(result.exitCode).to.equal(0)
    })

    it('handles file in mixed state', async () => {
      const repo = await setupEmptyRepository()
      const testFileName = 'README.md'
      const fullPath = Path.join(repo.path, testFileName)

      Fs.writeFileSync(fullPath, 'WRITING THE FIRST LINE\n')

      await GitProcess.exec([ 'add', testFileName ], repo.path)

      Fs.writeFileSync(fullPath, 'WRITING OVER THE TOP\n')

      const result = await removeFromIndex(repo, testFileName)
      expect(result.exitCode).to.equal(0)
    })
  })
})
