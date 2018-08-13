#!/usr/bin/env ts-node

import * as Path from 'path'
import { spawnSync, SpawnSyncOptions } from 'child_process'

const environmentVariables = {
  // setting commit information so that tests don't need to rely on global config
  GIT_AUTHOR_NAME: 'Joe Bloggs',
  GIT_AUTHOR_EMAIL: 'joe.bloggs@somewhere.com',
  GIT_COMMITTER_NAME: 'Joe Bloggs',
  GIT_COMMITTER_EMAIL: 'joe.bloggs@somewhere.com',
  // signalling to dugite to use the bundled Git environment
  TEST_ENV: '1',
  // ensuring Electron doesn't attach to the current console session (Windows only)
  ELECTRON_NO_ATTACH_CONSOLE: '1',
  // speed up ts-node usage by using the new transpile-only mode
  TS_NODE_TRANSPILE_ONLY: 'true',
}

const env = { ...process.env, ...environmentVariables }

// ensure commands are executed from the root of the repository
const repositoryRoot = Path.dirname(__dirname)

const options: SpawnSyncOptions = {
  cwd: repositoryRoot,
  env,
  // ensure stdout/stderr is propagated to the parent process so the test results
  // are displayed to the user
  stdio: 'inherit',
}

const electronMocha =
  process.platform === 'win32' ? 'electron-mocha.cmd' : 'electron-mocha'

const electronMochaPath = Path.join(
  repositoryRoot,
  'node_modules',
  '.bin',
  electronMocha
)

const electronMochaArgs = [
  // timeout for 10s
  '-t',
  '10000',
  // ensure tests are run within a renderer process
  '--renderer',
  '--require',
  'ts-node/register',
  '--require',
  './app/test/globals.ts',
  'app/test/unit/*.{ts,tsx}',
  'app/test/unit/**/*.{ts,tsx}',
]

const shouldDebug = process.argv.indexOf('--debug') > -1

if (shouldDebug) {
  electronMochaArgs.push('--debug')
}

let exitCode = -1

if (process.platform === 'linux') {
  // xvfb-maybe wraps xvfb-run to ensure Electron tests are run within the
  // context where the DISPLAY environment variable is set. It only runs on
  // Linux and is designed for CI scenarios, but this is making the whole
  // thing more explicit than the previous inline usage in package.json
  const xvfbMaybe = Path.join(
    repositoryRoot,
    'node_modules',
    '.bin',
    'xvfb-maybe'
  )

  const args = [
    // on Travis there may be a problem with the default display being
    // unavailable -  this ensures we use a free server number
    '--auto-servernum',
    '--',
    // and then we pass through the test runner commands
    electronMochaPath,
    ...electronMochaArgs,
  ]

  console.log(`spawing xvfb-maybe with args: ${args.join(' ')}`)

  const { status } = spawnSync(xvfbMaybe, args, options)
  exitCode = status
} else {
  console.log(
    `spawing electron-mocha with args: ${electronMochaArgs.join(' ')}`
  )

  const { status } = spawnSync(electronMochaPath, electronMochaArgs, options)
  exitCode = status
}

process.exitCode = exitCode
