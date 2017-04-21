/* tslint:disable:no-sync-functions */

import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { getConfigValue } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../fixture-helper'

const temp = require('temp').track()

describe('git/config', () => {

  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  after(() => {
    temp.cleanupSync()
  })

  describe('config', () => {
    it('looks up config values', async () => {
      const bare = await getConfigValue(repository!, 'core.bare')
      expect(bare).to.equal('false')
    })

    it('returns null for undefined values', async () => {
      const value = await getConfigValue(repository!, 'core.the-meaning-of-life')
      expect(value).to.equal(null)
    })
  })
})
