import * as path from 'path'
import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { getGitDir } from '../../../src/lib/git/rev-parse'
import { setupFixtureRepository } from '../../fixture-helper'

const temp = require('temp').track()

describe('git/rev-parse', () => {

  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('getGitDir', () => {
    it('should return the git dir path for a repository', async () => {
      const result = await getGitDir(repository!.path)
      expect(result).to.equal(path.join(repository!.path, '.git'))
    })

    it('should return null for a directory', async () => {
      const result = await getGitDir(path.dirname(repository!.path))
      expect(result).to.equal(null)
    })
  })
})
