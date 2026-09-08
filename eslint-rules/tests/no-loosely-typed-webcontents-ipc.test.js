// @ts-check

const { describe, it } = require('node:test')
const { TSESLint } = require('@typescript-eslint/utils')
const RuleTester = TSESLint.RuleTester
const rule = require('../no-loosely-typed-webcontents-ipc')

RuleTester.describe = describe
RuleTester.it = it

const ruleTester = new RuleTester({
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
  },
})

ruleTester.run('no-loosely-typed-webcontents-ipc', rule, {
  valid: [
    "send(window.webContents, 'channel')",
    "ipcWebContents.send('channel')",
    "foo.wc.send('channel')",
    "wc.invoke('channel')",
    "webContents.on('channel', handler)",
    "socket.send('channel')",
    "wc['send']('channel')",
    "window['webContents'].send('channel')",
  ],
  invalid: [
    "wc.send('channel')",
    "wc?.send('channel')",
    "wc.send?.('channel')",
    "webContents.send('channel')",
    "webContents?.send('channel')",
    "window.webContents.send('channel')",
    "window.webContents?.send('channel')",
    "window?.webContents.send?.('channel')",
  ].map(code => ({
    code,
    errors: [{ messageId: 'useStronglyTypedWebContentsIPC' }],
  })),
})
