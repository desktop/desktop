import { GHDatabase } from '../../src/database'

export const TestGHDatabasePath = '/Users/iamwillshepherd/Desktop/gh.db.json'

export function getTestGHDatabase() {
  let ghDb: GHDatabase | null = null

  return function() {
    if (ghDb === null) {
      ghDb = new GHDatabase(TestGHDatabasePath)
    }

    return ghDb
  }
}
