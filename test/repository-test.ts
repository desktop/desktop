import * as chai from 'chai'
const expect = chai.expect

import Repository from '../src/models/repository'

describe('Repository', () => {
  describe('name', () => {
    it('uses the last path component as the name', async () => {
      const repoPath = '/some/cool/path'
      const repository = new Repository(repoPath)
      expect(repository.getName()).to.equal('path')
    })
  })
})
