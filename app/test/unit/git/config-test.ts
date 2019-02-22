import { GitProcess } from 'dugite'
import * as Path from 'path'

import { Repository } from '../../../src/models/repository'
import {
  getConfigValue,
  getGlobalConfigPath,
  getGlobalConfigValue,
  setGlobalConfigValue,
} from '../../../src/lib/git'

import { mkdirSync } from '../../helpers/temp'
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
      expect(bare).toBe('false')
    })

    it('returns null for undefined values', async () => {
      const value = await getConfigValue(
        repository!,
        'core.the-meaning-of-life'
      )
      expect(value).toBeNull()
    })
  })

  describe('global config', () => {
    const HOME = mkdirSync('global-config-here')
    const env = { HOME }
    const expectedConfigPath = Path.normalize(Path.join(HOME, '.gitconfig'))
    const baseArgs = ['config', '-f', expectedConfigPath]

    describe('getGlobalConfigPath', () => {
      beforeEach(async () => {
        // getGlobalConfigPath requires at least one entry, so the
        // test needs to setup an existing config value
        await GitProcess.exec([...baseArgs, 'user.name', 'bar'], __dirname)
      })

      it('gets the config path', async () => {
        const path = await getGlobalConfigPath(env)
        expect(path).toBe(expectedConfigPath)
      })
    })

    describe('setGlobalConfigValue', () => {
      const key = 'foo.bar'

      beforeEach(async () => {
        await GitProcess.exec([...baseArgs, '--add', key, 'first'], __dirname)
        await GitProcess.exec([...baseArgs, '--add', key, 'second'], __dirname)
      })

      it('will replace all entries for a global value', async () => {
        await setGlobalConfigValue(key, 'the correct value', env)
        const value = await getGlobalConfigValue(key, env)
        expect(value).toBe('the correct value')
      })
    })
  })
})
