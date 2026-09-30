import assert from 'node:assert'
import { before, beforeEach, describe, it, mock } from 'node:test'
import { ipcRenderer } from 'electron'
import { MockIPC } from '../helpers/mock-ipc'
import { notificationCallbacks } from '../../src/lib/notifications/notification-handler'

let nativeNotificationsSupported = true
mock.module('desktop-notifications', {
  namedExports: {
    supportsNotifications: () => nativeNotificationsSupported,
  },
})

let showNotification: typeof import('../../src/lib/notifications/show-notification').showNotification
before(async () => {
  ;({ showNotification } = await import(
    '../../src/lib/notifications/show-notification'
  ))
})

describe('showNotification', () => {
  beforeEach(() => {
    nativeNotificationsSupported = true
    notificationCallbacks.clear()
  })

  for (const permission of ['granted', 'denied', 'default'] as const) {
    for (const windows of [false, true]) {
      it(`counts native ${permission} permission on ${
        windows ? 'Windows' : 'macOS'
      }`, async t => {
        const previousWindows = __WIN32__
        Object.assign(globalThis, { __WIN32__: windows })
        t.after(() => Object.assign(globalThis, { __WIN32__: previousWindows }))

        const ipc = new MockIPC()
        ipc.onInvoke('show-notification', async () => 'notification-id')
        ipc.onInvoke('get-notifications-permission', async () => permission)
        t.mock.method(ipcRenderer, 'invoke', ipc.invoke.bind(ipc))
        const onClick = () => {}

        assert.strictEqual(
          await showNotification({ title: 'Title', body: 'Body', onClick }),
          permission === 'granted' || (windows && permission === 'default')
        )
        assert.deepStrictEqual(
          ipc.invokes.map(call => call.channel),
          ['show-notification', 'get-notifications-permission']
        )
        assert.strictEqual(
          notificationCallbacks.get('notification-id'),
          onClick
        )
      })
    }
  }

  it('does not count native failures or register a click callback', async t => {
    const ipc = new MockIPC()
    ipc.onInvoke('show-notification', async () => null)
    t.mock.method(ipcRenderer, 'invoke', ipc.invoke.bind(ipc))
    const warn = t.mock.method(log, 'warn')

    assert.strictEqual(
      await showNotification({
        title: 'Title',
        body: 'Body',
        onClick: () => {},
      }),
      false
    )
    assert.strictEqual(notificationCallbacks.size, 0)
    assert.strictEqual(ipc.invokes.length, 1)
    assert.strictEqual(warn.mock.callCount(), 1)
  })

  it('propagates IPC failures', async t => {
    t.mock.method(ipcRenderer, 'invoke', async () => {
      throw new Error('Notification IPC failed')
    })
    await assert.rejects(
      showNotification({ title: 'Title', body: 'Body', onClick: () => {} }),
      /Notification IPC failed/
    )
  })

  it('propagates permission lookup failures after native submission', async t => {
    const ipc = new MockIPC()
    ipc.onInvoke('show-notification', async () => 'notification-id')
    ipc.onInvoke('get-notifications-permission', async () => {
      throw new Error('Permission lookup failed')
    })
    t.mock.method(ipcRenderer, 'invoke', ipc.invoke.bind(ipc))
    await assert.rejects(
      showNotification({ title: 'Title', body: 'Body', onClick: () => {} }),
      /Permission lookup failed/
    )
  })

  it('does not count notifications when neither API is available', async t => {
    nativeNotificationsSupported = false
    const descriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'Notification'
    )
    Object.defineProperty(globalThis, 'Notification', {
      configurable: true,
      value: undefined,
    })
    t.after(() => {
      if (descriptor === undefined) {
        Reflect.deleteProperty(globalThis, 'Notification')
      } else {
        Object.defineProperty(globalThis, 'Notification', descriptor)
      }
    })
    const warn = t.mock.method(log, 'warn')
    assert.strictEqual(
      await showNotification({
        title: 'Title',
        body: 'Body',
        onClick: () => {},
      }),
      false
    )
    assert.strictEqual(warn.mock.callCount(), 1)
  })

  for (const event of ['show', 'error'] as const) {
    it(`waits for the HTML5 ${event} event`, async t => {
      nativeNotificationsSupported = false
      const descriptor = Object.getOwnPropertyDescriptor(
        globalThis,
        'Notification'
      )
      const notification = {
        onclick: () => {},
        onshow: () => {},
        onerror: () => {},
      }
      function Notification() {
        return notification
      }
      Object.defineProperty(globalThis, 'Notification', {
        configurable: true,
        value: Notification,
      })
      t.after(() => {
        if (descriptor === undefined) {
          Reflect.deleteProperty(globalThis, 'Notification')
        } else {
          Object.defineProperty(globalThis, 'Notification', descriptor)
        }
      })
      const ipc = new MockIPC()
      const sendDescriptor = Object.getOwnPropertyDescriptor(
        ipcRenderer,
        'send'
      )
      Object.defineProperty(ipcRenderer, 'send', {
        configurable: true,
        value: ipc.send.bind(ipc),
      })
      t.after(() => {
        if (sendDescriptor === undefined) {
          Reflect.deleteProperty(ipcRenderer, 'send')
        } else {
          Object.defineProperty(ipcRenderer, 'send', sendDescriptor)
        }
      })
      const onClick = t.mock.fn()
      const warn = t.mock.method(log, 'warn')
      let settled = false
      const result = showNotification({
        title: 'Title',
        body: 'Body',
        onClick,
      }).then(shown => {
        settled = true
        return shown
      })
      await Promise.resolve()
      assert.strictEqual(settled, false)

      if (event === 'show') {
        notification.onshow()
      } else {
        notification.onerror()
      }

      assert.strictEqual(await result, event === 'show')
      assert.strictEqual(warn.mock.callCount(), event === 'error' ? 1 : 0)
      if (event === 'show') {
        notification.onclick()
        assert.strictEqual(onClick.mock.callCount(), 1)
        assert.strictEqual(ipc.getSends('focus-window').length, 1)
      }
    })
  }
})
