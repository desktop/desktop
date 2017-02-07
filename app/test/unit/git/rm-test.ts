import * as Fs from 'fs'
import * as Path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { removeFromIndex } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../fixture-helper'

const temp = require('temp').track()

describe.only('git/rm', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
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
  })
})
