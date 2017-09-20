/* tslint:disable:no-sync-functions */

import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import { getConfigValue, getGlobalConfigPath } from '../../../src/lib/git'
import { setupFixtureRepository } from '../../fixture-helper'

describe('git/config', () => {
  let repository: Repository | null = null

  beforeEach(() => {
    const testRepoPath = setupFixtureRepository('test-repo')
    repository = new Repository(testRepoPath, -1, null, false)
  })

  describe('config', () => {
    it('looks up config values', async () => {
      const bare = await getConfigValue(repository!, 'core.bare')
      expect(bare).to.equal('false')
    })

    it('returns null for undefined values', async () => {
      const value = await getConfigValue(
        repository!,
        'core.the-meaning-of-life'
      )
      expect(value).to.equal(null)
    })
  })

  describe('getGlobalConfigPath', () => {
    it('gets the config path', async () => {
      const path = await getGlobalConfigPath()
      expect(path).not.to.equal(null)
      expect(path!.length).to.be.greaterThan(0)
    })
  })
})
