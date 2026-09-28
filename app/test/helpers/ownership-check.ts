import { TestContext } from 'node:test'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createTempDirectory } from './temp'

/** Isolate Git configuration and enable ownership checks for a test. */
export async function setupOwnershipCheck(t: TestContext) {
  const home = await createTempDirectory(t)
  const globalConfigPath = join(home, '.gitconfig')
  await writeFile(globalConfigPath, '[safe]\n\tdirectory =\n')

  const env = {
    HOME: home,
    XDG_CONFIG_HOME: home,
    GIT_CONFIG_GLOBAL: globalConfigPath,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TEST_ASSUME_DIFFERENT_OWNER: '1',
  }

  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name]
    t.after(() => {
      if (previous === undefined) {
        delete process.env[name]
      } else {
        process.env[name] = previous
      }
    })
    process.env[name] = value
  }

  return globalConfigPath
}
