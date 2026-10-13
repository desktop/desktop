import assert from 'node:assert'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'
import { isolateGitConfig } from '../helpers/git-config'

describe('Git configuration isolation', () => {
  for (const initiallySet of [false, true]) {
    it(`restores configuration variables with initiallySet=${initiallySet}`, async t => {
      const names = [
        'GIT_CONFIG_GLOBAL',
        'GIT_CONFIG_SYSTEM',
        'GIT_CONFIG_NOSYSTEM',
      ]
      const original = names.map(name => ({ name, value: process.env[name] }))
      t.after(() => {
        for (const { name, value } of original) {
          if (value === undefined) {
            delete process.env[name]
          } else {
            process.env[name] = value
          }
        }
      })

      for (const name of names) {
        if (initiallySet) {
          process.env[name] = `inherited-${name}`
        } else {
          delete process.env[name]
        }
      }
      const inherited = names.map(name => process.env[name])

      await t.test(
        'isolates configuration and permits fixture overrides',
        async t => {
          await isolateGitConfig(t)
          const globalConfig = process.env.GIT_CONFIG_GLOBAL
          assert(globalConfig !== undefined)
          assert.strictEqual(await readFile(globalConfig, 'utf8'), '')
          assert.strictEqual(process.env.GIT_CONFIG_SYSTEM, globalConfig)
          assert.strictEqual(process.env.GIT_CONFIG_NOSYSTEM, '1')

          process.env.GIT_CONFIG_GLOBAL = 'test-global-override'
          process.env.GIT_CONFIG_SYSTEM = 'test-system-override'
          process.env.GIT_CONFIG_NOSYSTEM = '0'
        }
      )

      assert.deepStrictEqual(
        names.map(name => process.env[name]),
        inherited
      )
    })
  }
})
