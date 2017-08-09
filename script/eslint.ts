#!/usr/bin/env node

import ChildProcess = require('child_process')

const ESLINT_ARGS = [
  '--cache',
  '--rulesdir=./eslint-rules',
  '--ext=.js,.ts,.jsx,.tsx',
  './eslint-rules',
  './tslint-rules/*.ts',
  './app/{src,typings,test}',
]
const opts = {
  stdio: 'inherit',
}

if (process.env.CI) {
  ChildProcess.spawn('eslint', ESLINT_ARGS, opts)
} else {
  ChildProcess.spawn('eslint_d', ESLINT_ARGS, opts)
}
