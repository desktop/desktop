import * as chai from 'chai'
const expect = chai.expect

import { Repository } from '../../src/models/repository'

describe('Repository', () => {
  describe('name', () => {
    it('uses the last path component as the name', async () => {
      const repoPath = '/some/cool/path'
      const repository = new Repository(repoPath, -1, null, false)
      expect(repository.name).to.equal('path')
    })
  })
})
