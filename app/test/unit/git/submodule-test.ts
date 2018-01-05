/* eslint-disable no-sync */

import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { listSubmodules } from '../../../src/lib/git/submodule'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('git/submodule', () => {
  describe('listSubmodules', () => {
    it('should return both remotes', async () => {
      const testRepoPath = setupFixtureRepository('submodule-basic-setup')
      const repository = new Repository(testRepoPath, -1, null, false)
      const result = await listSubmodules(repository)
      expect(result.length).to.equal(1)
      expect(result[0].sha).to.equal('c59617b65080863c4ca72c1f191fa1b423b92223')
      expect(result[0].path).to.equal('foo/submodule')
      expect(result[0].nearestTag).to.equal('first-tag~2')
    })
  })
})
