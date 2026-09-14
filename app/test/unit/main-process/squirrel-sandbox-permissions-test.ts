import { beforeEach, describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as Path from 'node:path'

const grants: string[] = []
const operations: string[] = []
let failGrant = false

mock.module('../../../src/main-process/windows-sandbox-permissions', {
  namedExports: {
    grantWindowsSandboxPermissions: (folder: string) => {
      grants.push(folder)
      operations.push('grant')
      if (failGrant) {
        throw new Error('access denied')
      }
    },
  },
})
mock.module('../../../src/lib/process/win32', {
  namedExports: {
    spawn: async () => {
      operations.push('shortcut')
    },
    getPathSegments: () => [],
    setPathSegments: async () => {},
  },
})
mock.module('../../../src/lib/path-exists', {
  namedExports: { pathExists: async () => false },
})
mock.module('fs/promises', {
  namedExports: { mkdir: async () => {}, writeFile: async () => {} },
})

beforeEach(() => {
  grants.length = 0
  operations.length = 0
  failGrant = false
})

describe('Squirrel sandbox permissions', () => {
  for (const event of ['--squirrel-install', '--squirrel-updated']) {
    it(`grants access synchronously before handling ${event}`, async () => {
      const { handleSquirrelEvent } = await import(
        '../../../src/main-process/squirrel-updater'
      )
      const result = handleSquirrelEvent(event)
      assert.deepEqual(grants, [Path.dirname(process.execPath)])
      assert.equal(operations[0], 'grant')
      await result
      assert.ok(operations.includes('shortcut'))
    })
  }

  it('leaves permissions alone for normal launches, uninstall, and obsolete events', async () => {
    const { handleSquirrelEvent } = await import(
      '../../../src/main-process/squirrel-updater'
    )
    for (const event of [
      '',
      '--protocol-launcher',
      '--squirrel-uninstall',
      '--squirrel-obsolete',
    ]) {
      await handleSquirrelEvent(event)
    }
    assert.deepEqual(grants, [])
  })

  it('logs a failed grant and continues installation', async t => {
    const { handleSquirrelEvent } = await import(
      '../../../src/main-process/squirrel-updater'
    )
    failGrant = true
    const errorLog = t.mock.method(log, 'error', () => {})
    await handleSquirrelEvent('--squirrel-install')
    assert.equal(errorLog.mock.callCount(), 1)
    assert.ok(operations.includes('shortcut'))
  })
})
