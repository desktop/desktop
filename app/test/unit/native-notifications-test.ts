import assert from 'node:assert'
import { after, before, beforeEach, describe, it, mock } from 'node:test'
import Module, { createRequire } from 'node:module'

const submitNotification = mock.fn(
  async (
    _id: string,
    _title: string,
    _body: string,
    _userInfo?: Record<string, unknown>
  ) => {}
)
mock.module('desktop-notifications/dist/notification-support.js', {
  namedExports: { supportsNotifications: () => true },
})

const require = createRequire(__filename)
const nativeModulePath = require.resolve(
  'desktop-notifications/build/Release/desktop-notifications.node'
)
const previousModule = require.cache[nativeModulePath]
// node:test cannot mock addons, so replace only the native module cache entry.
const nativeModule = new Module(nativeModulePath)
nativeModule.exports = { showNotification: submitNotification }
nativeModule.loaded = true
require.cache[nativeModulePath] = nativeModule
after(() => {
  if (previousModule === undefined) {
    delete require.cache[nativeModulePath]
  } else {
    require.cache[nativeModulePath] = previousModule
  }
})

let showNotification: typeof import('desktop-notifications').showNotification
before(async () => {
  ;({ showNotification } = await import('desktop-notifications'))
})

describe('native notification wrapper', () => {
  beforeEach(() => {
    submitNotification.mock.resetCalls()
    submitNotification.mock.mockImplementation(async () => {})
  })

  it('returns an ID only after native submission succeeds', async () => {
    const userInfo = { type: 'pr-checks-failed' }
    const id = await showNotification('Title', 'Body', userInfo)

    assert.strictEqual(typeof id, 'string')
    assert.deepStrictEqual(submitNotification.mock.calls[0].arguments, [
      id,
      'Title',
      'Body',
      userInfo,
    ])
  })

  it('returns null when native submission rejects with a failed HRESULT', async () => {
    const error = Object.assign(
      new Error('Failed to show Windows toast notification'),
      {
        hresult: -2147467259,
      }
    )
    submitNotification.mock.mockImplementation(async () => {
      throw error
    })

    assert.strictEqual(await showNotification('Title', 'Body'), null)
    assert.strictEqual(submitNotification.mock.callCount(), 1)
  })

  it('returns null when native submission throws before returning a promise', async () => {
    submitNotification.mock.mockImplementation(() => {
      throw new Error(
        'Cannot show notification: notifications not initialized.'
      )
    })

    assert.strictEqual(await showNotification('Title', 'Body'), null)
  })
})
