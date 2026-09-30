import assert from 'node:assert'
import { describe, it, mock, TestContext } from 'node:test'
import { ipcRenderer } from 'electron'
import { MockIPC } from '../helpers/mock-ipc'

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

function mockNotification(t: TestContext, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Notification')
  Object.defineProperty(globalThis, 'Notification', {
    configurable: true,
    value,
  })
  t.after(() => {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, 'Notification')
    } else {
      Object.defineProperty(globalThis, 'Notification', descriptor)
    }
  })
}

describe('system notification permission', () => {
  for (const permission of ['granted', 'denied', 'default'] as const) {
    it(`reads native ${permission} permission without requesting it`, async t => {
      nativeNotificationsSupported = true
      const ipc = new MockIPC()
      ipc.onInvoke('get-notifications-permission', async () => permission)
      t.mock.method(ipcRenderer, 'invoke', ipc.invoke.bind(ipc))

      assert.strictEqual(await getSystemNotificationsPermission(), permission)
      assert.deepStrictEqual(
        ipc.invokes.map(call => call.channel),
        ['get-notifications-permission']
      )
    })

    it(`reads HTML5 ${permission} permission without native IPC`, async t => {
      nativeNotificationsSupported = false
      mockNotification(t, { permission })
      const invoke = t.mock.method(ipcRenderer, 'invoke')

      assert.strictEqual(await getSystemNotificationsPermission(), permission)
      assert.strictEqual(invoke.mock.callCount(), 0)
    })
  }

  it('reports null when neither notification API is available', async t => {
    nativeNotificationsSupported = false
    mockNotification(t, undefined)
    assert.strictEqual(await getSystemNotificationsPermission(), null)
  })

  it('propagates permission lookup failures', async t => {
    nativeNotificationsSupported = true
    t.mock.method(ipcRenderer, 'invoke', async () => {
      throw new Error('Permission lookup failed')
    })
    await assert.rejects(
      getSystemNotificationsPermission(),
      /Permission lookup failed/
    )
  })
})
