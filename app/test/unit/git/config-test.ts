import { expect } from 'chai'

import { Repository } from '../../../src/models/repository'
import {
  getConfigValue,
  getGlobalConfigPath,
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../../src/lib/git'
import { GitProcess } from 'dugite'
import { setupFixtureRepository } from '../../helpers/repositories'

describe('git/config', () => {
  let repository: Repository | null = null

  beforeEach(async () => {
    const testRepoPath = await setupFixtureRepository('test-repo')
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

  describe('setGlobalConfigValue', () => {
    const key = 'foo.bar'

    beforeEach(async () => {
      await GitProcess.exec(
        ['config', '--add', '--global', key, 'first'],
        __dirname
      )
      await GitProcess.exec(
        ['config', '--add', '--global', key, 'second'],
        __dirname
      )
    })

    it('will replace all entries for a global value', async () => {
      await setGlobalConfigValue(key, 'the correct value')
      const value = await getGlobalConfigValue(key)
      expect(value).to.equal('the correct value')
    })

    afterEach(async () => {
      await GitProcess.exec(
        ['config', '--unset-all', '--global', key],
        __dirname
      )
    })
  })
})
