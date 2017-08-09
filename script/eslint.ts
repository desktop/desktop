#!/usr/bin/env ts-node

import ChildProcess = require('child_process')
import Path = require('path')

const ESLINT_ARGS = [
  '--cache',
  '--rulesdir=./eslint-rules',
  './{script,eslint-rules}/**/*.{j,t}s?(x)',
  './tslint-rules/**/*.ts',
  './app/{src,typings,test}/**/*.{j,t}s?(x)',
  ...process.argv.slice(2),
]
const opts = {
  stdio: 'inherit',
}

if (process.env.CI) {
  ChildProcess.spawn(
    Path.resolve(__dirname, '..', 'node_modules', '.bin', 'eslint'),
    ESLINT_ARGS,
    opts
  )
} else {
  console.log('> Spinning up eslint_d\n')
  require('eslint_d/lib/client').lint(ESLINT_ARGS)
}
