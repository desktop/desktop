import * as FSE from 'fs-extra'
import { expect } from 'chai'
import { getTestGHDatabase, TestGHDatabasePath } from '../test-gh-database'
import { Collections } from '../../../src/database'

const testDb = getTestGHDatabase()

describe('Database', () => {
  describe('Initialization', () => {
    it('initializes all collections', () => {
      const repos = testDb().getCollection(Collections.Repository)

      expect(repos).is.not.null
    })
  })

  describe('Adding data', () => {
    it('persists the data to disk', async () => {
      const repos = testDb().getCollection(Collections.Repository)
      await repos.insertOne({
        kind: 'repository',
        name: 'test',
        path: '~/ghd.test.db',
        isMissing: false,
      })

      await testDb().save()

      const exists = FSE.existsSync(TestGHDatabasePath)

      expect(exists).is.true
    })
  })
})
