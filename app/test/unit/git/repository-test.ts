import * as path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { isGitRepository } from '../../../src/lib/git/repository'
import { setupFixtureRepository } from '../../fixture-helper'

const temp = require('temp').track()

describe('git/status', () => {

  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('isGitRepository', () => {
    it('should return true for a repository', async () => {
      const result = await isGitRepository(repository!.path)
      expect(result).to.equal(true)
    })

    it('should return false for a directory', async () => {
      const result = await isGitRepository(path.dirname(repository!.path))
      expect(result).to.equal(false)
    })
  })
})
