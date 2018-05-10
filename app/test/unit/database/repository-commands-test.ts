import { expect } from 'chai'
import { getTestGHDatabase } from '../../helpers/test-gh-database'
import { RepositoryCommands, Collections } from '../../../src/database'

const testDb = getTestGHDatabase()

describe('Repository Commands', () => {
  describe('Add repository', () => {
    it('works', async () => {
      const testPath = 'test'
      await RepositoryCommands.addRepository(testPath)

      const addedRepo = testDb()
        .getCollection(Collections.Repository)
        .find()

      expect(addedRepo.length).to.equal(1)
    })
  })
})
