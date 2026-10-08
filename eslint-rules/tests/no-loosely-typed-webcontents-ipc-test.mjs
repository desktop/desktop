// @ts-check

import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { TSESLint } from '@typescript-eslint/utils'
const RuleTester = TSESLint.RuleTester
import rule from '../no-loosely-typed-webcontents-ipc.js'

describe('no-loosely-typed-webcontents-ipc', () => {
  it('rejects untyped IPC, including optional calls and property access', () => {
    const ruleTester = new RuleTester({
      parser: fileURLToPath(import.meta.resolve('@typescript-eslint/parser')),
      parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
      },
    })

    ruleTester.run('no-loosely-typed-webcontents-ipc', rule, {
      valid: [
        "ipcWebContents.send(webContents, 'channel')",
        "other.send('channel')",
        "other.wc.send('channel')",
        "window.other.send('channel')",
        "window['other'].send('channel')",
        'webContents.reload()',
      ],
      invalid: [
        "wc.send('channel')",
        "wc?.send('channel')",
        "wc.send?.('channel')",
        "webContents.send('channel')",
        "webContents?.send('channel')",
        "webContents.send?.('channel')",
        "window.webContents.send('channel')",
        "window.webContents?.send('channel')",
        "window?.webContents.send('channel')",
        "window.webContents.send?.('channel')",
      ].map(code => ({
        code,
        errors: [{ messageId: 'useStronglyTypedWebContentsIPC' }],
      })),
    })
  })
})
