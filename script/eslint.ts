#!/usr/bin/env ts-node

import * as Path from 'path'
import chalk from 'chalk'
import { execFile } from 'child_process'

const args = [
  '--cache',
  '--rulesdir=./eslint-rules',
  './{script,eslint-rules}/**/*.{j,t}s?(x)',
  './tslint-rules/**/*.ts',
  './app/*.js',
  './app/{src,typings,test}/**/*.{j,t}s?(x)',
  ...process.argv.slice(2),
]

const root = Path.join(__dirname, '..')
const eslintPath = Path.join(root, 'node_modules', '.bin', 'eslint')
const child = execFile(eslintPath, args, { cwd: root }, (err, stdout) => {
  console.log(stdout)
})

child.on('exit', code => {
  if (code && args.indexOf('--fix') === -1) {
    console.error(
      chalk`{bold.green → To fix some of these errors, run {underline yarn eslint:fix}}`
    )
  }
})
