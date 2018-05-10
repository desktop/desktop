import { GHDatabase } from '../../src/database'

export const TestGHDatabasePath = '/users/williamrshepherd/Desktop/gh.test.db'

export function getTestGHDatabase() {
  let ghDb: GHDatabase | null = null

  return function() {
    if (ghDb === null) {
      ghDb = new GHDatabase(TestGHDatabasePath)
    }

    return ghDb
  }
}
