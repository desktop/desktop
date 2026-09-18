import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SuiteContext, TestContext } from 'node:test'
import { createTempDirectory } from './temp'

/**
 * Isolate a test from inherited global and system Git configuration.
 *
 * Register with beforeEach in suites that need predictable remotes and URL
 * rewrites. Tests may override these variables; teardown restores their original
 * values. Since the environment is process-wide, these tests must run serially.
 */
export async function isolateGitConfig(
  t: TestContext | SuiteContext
): Promise<void> {
  if (!('after' in t)) {
    throw new Error(
      'Git configuration isolation must run in a test or beforeEach hook'
    )
  }

  const config = join(await createTempDirectory(t), 'empty-config')
  await writeFile(config, '')

  const environment = {
    GIT_CONFIG_GLOBAL: config,
    GIT_CONFIG_SYSTEM: config,
    GIT_CONFIG_NOSYSTEM: '1',
  }
  const previous = Object.keys(environment).map(name => ({
    name,
    value: process.env[name],
  }))

  t.after(() => {
    for (const { name, value } of previous) {
      if (value === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = value
      }
    }
  })

  for (const [name, value] of Object.entries(environment)) {
    process.env[name] = value
  }
}
