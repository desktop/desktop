import { TestContext } from 'node:test'

/** Replaces the HTML5 notification API and restores it after the test. */
export function mockNotification(t: TestContext, value: unknown) {
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
