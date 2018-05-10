import { GHDatabase } from '../../src/database'

export function getTestGHDatabase() {
  let ghDb: GHDatabase | null = null

  return function() {
    if (ghDb === null) {
      ghDb = new GHDatabase('/users/williamrshepherd/Desktop/gh.test.db')
    }

    return ghDb
  }
}
