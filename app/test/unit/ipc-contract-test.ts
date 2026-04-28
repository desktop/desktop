import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  RequestChannels,
  RequestResponseChannels,
} from '../../src/lib/ipc-shared'

/**
 * These tests verify the IPC channel contract — the set of channels that
 * the renderer and main processes use to communicate. The curated runtime
 * lists below are compile-time checked to ensure they enumerate every
 * channel in the corresponding type exactly once.
 */
describe('IPC channel contract', () => {
  type AssertExactUnion<TExpected, TActual> = [
    Exclude<TExpected, TActual>,
    Exclude<TActual, TExpected>
  ] extends [never, never]
    ? true
    : never

  const expectedRequestChannels = [
    'select-all-window-contents',
    'dialog-did-open',
    'update-menu-state',
    'renderer-ready',
    'execute-menu-item-by-id',
    'show-certificate-trust-dialog',
    'get-app-menu',
    'update-preferred-app-menu-item-labels',
    'uncaught-exception',
    'send-error-report',
    'unsafe-open-directory',
    'menu-event',
    'log',
    'will-quit',
    'will-quit-even-if-updating',
    'cancel-quitting',
    'crash-ready',
    'crash-quit',
    'window-state-changed',
    'error',
    'zoom-factor-changed',
    'app-menu',
    'launch-timing-stats',
    'url-action',
    'cli-action',
    'certificate-error',
    'focus',
    'blur',
    'update-accounts',
    'quit-and-install-updates',
    'quit-app',
    'minimize-window',
    'maximize-window',
    'unmaximize-window',
    'close-window',
    'auto-updater-error',
    'auto-updater-checking-for-update',
    'auto-updater-update-available',
    'auto-updater-update-not-available',
    'auto-updater-update-downloaded',
    'native-theme-updated',
    'set-native-theme-source',
    'update-window-background-color',
    'focus-window',
    'notification-event',
    'set-window-zoom-factor',
    'show-installing-update',
    'install-windows-cli',
    'uninstall-windows-cli',
  ] as const

  const expectedResponseChannels = [
    'get-path',
    'get-app-architecture',
    'get-app-path',
    'get-exec-path',
    'is-running-under-arm64-translation',
    'move-to-trash',
    'show-item-in-folder',
    'show-contextual-menu',
    'is-window-focused',
    'open-external',
    'is-in-application-folder',
    'move-to-applications-folder',
    'check-for-updates',
    'get-current-window-state',
    'get-current-window-zoom-factor',
    'resolve-proxy',
    'show-save-dialog',
    'show-open-dialog',
    'is-window-maximized',
    'get-apple-action-on-double-click',
    'should-use-dark-colors',
    'save-guid',
    'get-guid',
    'show-notification',
    'get-notifications-permission',
    'request-notifications-permission',
  ] as const

  describe('RequestChannels', () => {
    it('lists every request channel exactly once', () => {
      const isValid: ReadonlyArray<keyof RequestChannels> =
        expectedRequestChannels
      const isExhaustive: AssertExactUnion<
        keyof RequestChannels,
        typeof expectedRequestChannels[number]
      > = true

      assert.equal(isValid.length, expectedRequestChannels.length)
      assert.equal(isExhaustive, true)
    })

    it('includes critical lifecycle channels', () => {
      const critical: ReadonlyArray<keyof RequestChannels> = [
        'renderer-ready',
        'uncaught-exception',
        'will-quit',
        'log',
        'error',
      ]
      for (const channel of critical) {
        assert.ok(
          expectedRequestChannels.includes(channel),
          `Missing critical channel: ${channel}`
        )
      }
    })
  })

  describe('RequestResponseChannels', () => {
    it('lists every request-response channel exactly once', () => {
      const isValid: ReadonlyArray<keyof RequestResponseChannels> =
        expectedResponseChannels
      const isExhaustive: AssertExactUnion<
        keyof RequestResponseChannels,
        typeof expectedResponseChannels[number]
      > = true

      assert.equal(isValid.length, expectedResponseChannels.length)
      assert.equal(isExhaustive, true)
    })

    it('includes critical request-response channels', () => {
      const critical: ReadonlyArray<keyof RequestResponseChannels> = [
        'get-path',
        'open-external',
        'show-save-dialog',
        'show-open-dialog',
        'should-use-dark-colors',
      ]
      for (const channel of critical) {
        assert.ok(
          expectedResponseChannels.includes(channel),
          `Missing critical channel: ${channel}`
        )
      }
    })
  })
})
