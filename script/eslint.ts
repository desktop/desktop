#!/usr/bin/env ts-node

interface IClient {
  // there’s other stuff; I’m not including it
  // because it’s not needed here.
  // If you want to add to it, here’s the source:
  // https://github.com/mantoni/eslint_d.js/blob/v5.1.0/lib/client.js
  lint(args: string[], text?: string): void
}

const client: IClient = require('eslint_d/lib/client')

const ESLINT_ARGS = [
  '--cache',
  '--rulesdir=./eslint-rules',
  './{script,eslint-rules}/**/*.{j,t}s?(x)',
  './tslint-rules/**/*.ts',
  './app/{src,typings,test}/**/*.{j,t}s?(x)',
  ...process.argv.slice(2),
]

client.lint(ESLINT_ARGS)

type ProcessOnExit = (cb: (code: number) => void) => void
const onExit = process.on.bind(process, 'exit') as ProcessOnExit

onExit(code => {
  if (code && ESLINT_ARGS.indexOf('--fix') === -1) {
    console.error(
      '\x1b[1m\x1b[32m→ To fix some of these errors, run \x1b[4mnpm run eslint:fix\x1b[24\x1b[39m\x1b[22m\n'
    )
  }
})
