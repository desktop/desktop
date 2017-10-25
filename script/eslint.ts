#!/usr/bin/env ts-node

import chalk from 'chalk'

/**
 * A partial `eslint_d` client interface.
 * It currently only includes the methods actually used by this file.
 */
interface IClient {
  // there’s other stuff; I’m not including it
  // because it’s not needed here.
  // If you want to add to it, here’s the source:
  // https://github.com/mantoni/eslint_d.js/blob/v5.1.0/lib/client.js
  /**
   * Lint a project using the ESLint server instance,
   * or start a new instance if one is not available.
   * @param args The arguments to pass to ESLint.
   *             Interpreted as if passed after `eslint` on the command line.
   * @param text The text to lint, if no files are passed as arguments.
   */
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
/** HACK: allow process.on('exit') to be called with a `number` */
const onExit = process.on.bind(process, 'exit') as ProcessOnExit

onExit(code => {
  if (code && ESLINT_ARGS.indexOf('--fix') === -1) {
    console.error(
      chalk`{bold.green → To fix some of these errors, run {underline yarn eslint:fix}}`
    )
  }
})
