#!/usr/bin/env ts-node

import * as Path from 'path'
import chalk from 'chalk'
import { spawnSync } from 'child_process'

const shouldFix = process.argv.indexOf('--fix') > -1

const root = Path.dirname(__dirname)

const prettier = process.platform === 'win32' ? 'prettier.cmd' : 'prettier'
const prettierPath = Path.join(root, 'node_modules', '.bin', prettier)

const args = ['**/*.{md,scss}']

if (shouldFix) {
  args.push('--write')
} else {
  args.push('--list-different')
}

const result = spawnSync(prettierPath, args, {
  cwd: root,
})

if (result.status > 0) {
  process.exitCode = result.status

  console.log('These files are not formatted correctly:\n')
  console.log(result.stdout.toString())

  console.error(
    chalk`{bold.green → To fix these errors, run {underline yarn lint:prettier --write}}`
  )
} else if (result.status < 0) {
  process.exitCode = result.status

  console.log(`prettier returned an unexpected exit code: ${result.status}.`)
  console.log(`stdout: '${result.stdout.toString()}'`)
  console.log(`stderr: '${result.stderr.toString()}'`)
}
