import assert from 'node:assert'
import { describe, it, mock } from 'node:test'
import { ipcRenderer } from 'electron'
import { MockIPC } from '../helpers/mock-ipc'
import { mockNotification } from '../helpers/mock-notification'

let nativeNotificationsSupported = true
mock.module('desktop-notifications', {
  namedExports: {
    supportsNotifications: () => nativeNotificationsSupported,
  },
})

async function getSystemNotificationsPermission() {
  const module = await import(
    '../../src/lib/notifications/notification-permission'
  )
  return module.getSystemNotificationsPermission()
}

describe('system notification permission', () => {
  for (const permission of ['granted', 'denied', 'default'] as const) {
    for (const windows of [false, true]) {
      it(`normalizes native ${permission} permission on ${
        windows ? 'Windows' : 'macOS'
      } without requesting it`, async t => {
        const previousWindows = __WIN32__
        Object.assign(globalThis, { __WIN32__: windows })
        t.after(() => Object.assign(globalThis, { __WIN32__: previousWindows }))
        nativeNotificationsSupported = true
        const ipc = new MockIPC()
        ipc.onInvoke('get-notifications-permission', async () => permission)
        t.mock.method(ipcRenderer, 'invoke', ipc.invoke.bind(ipc))

        assert.strictEqual(
          await getSystemNotificationsPermission(),
          permission === 'granted' || (windows && permission === 'default')
        )
        assert.deepStrictEqual(
          ipc.invokes.map(call => call.channel),
          ['get-notifications-permission']
        )
      })
    }

    it(`reads HTML5 ${permission} permission without native IPC`, async t => {
      nativeNotificationsSupported = false
      mockNotification(t, { permission })
      const invoke = t.mock.method(ipcRenderer, 'invoke')

      assert.strictEqual(
        await getSystemNotificationsPermission(),
        permission === 'granted'
      )
      assert.strictEqual(invoke.mock.callCount(), 0)
    })
  }

  it('reports null when neither notification API is available', async t => {
    nativeNotificationsSupported = false
    mockNotification(t, undefined)
    assert.strictEqual(await getSystemNotificationsPermission(), null)
  })

  it('reports null and logs native permission lookup failures', async t => {
    nativeNotificationsSupported = true
    const error = new Error('Permission lookup failed')
    t.mock.method(ipcRenderer, 'invoke', async () => {
      throw error
    })
    const warn = t.mock.method(log, 'warn')

    assert.strictEqual(await getSystemNotificationsPermission(), null)
    assert.deepStrictEqual(warn.mock.calls[0].arguments, [
      'Failed to read system notification permission',
      error,
    ])
  })

  it('reports null and logs HTML5 permission lookup failures', async t => {
    nativeNotificationsSupported = false
    const error = new Error('Permission lookup failed')
    mockNotification(t, {
      get permission() {
        throw error
      },
    })
    const warn = t.mock.method(log, 'warn')

    assert.strictEqual(await getSystemNotificationsPermission(), null)
    assert.deepStrictEqual(warn.mock.calls[0].arguments, [
      'Failed to read system notification permission',
      error,
    ])
  })
})
