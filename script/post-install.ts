#!/usr/bin/env ts-node

import * as Path from 'path'
import { spawnSync, SpawnSyncOptions } from 'child_process'

import { getAppInstallCommands, getNpmCommand } from './npm'

const root = Path.dirname(__dirname)

const options: SpawnSyncOptions = {
  cwd: root,
  stdio: 'inherit',
}

const captureOutputOptions: SpawnSyncOptions = {
  cwd: root,
  encoding: 'utf8',
}

// Some Windows CI runners do not expose an `npx` executable on PATH, so
// invoke the locally installed Playwright CLI through the current Node binary.
// Resolve from the exported package root since `playwright/cli` is not exported.
const playwrightPackagePath = require.resolve('playwright/package.json')
const playwrightCliPath = Path.join(
  Path.dirname(playwrightPackagePath),
  'cli.js'
)

for (const args of getAppInstallCommands()) {
  const appInstall = getNpmCommand(args)
  const result = spawnSync(appInstall.executable, appInstall.args, options)
  if (result.status !== 0) {
    console.error(result.error ?? 'Failed to install application dependencies')
    process.exit(result.status || 1)
  }
}

// Electron >= 42 no longer downloads its prebuilt binary in its own
// postinstall; do it eagerly so scripts that read node_modules/electron/dist
// (e.g. validate-macos-version) keep working without first requiring electron.
const electronInstallScript = require.resolve('electron/install.js')
let result = spawnSync(process.execPath, [electronInstallScript], options)

if (result.status !== 0) {
  process.exit(result.status || 1)
}

result = spawnSync(
  'git',
  ['submodule', 'update', '--recursive', '--init'],
  options
)

if (result.status !== 0) {
  process.exit(result.status || 1)
}

const compileScript = getNpmCommand(['run', 'compile:script'])
result = spawnSync(compileScript.executable, compileScript.args, options)

if (result.status !== 0) {
  console.error(result.error ?? 'Failed to compile build scripts')
  process.exit(result.status || 1)
}

// Capture output here so CI failures include the Playwright-specific error.
result = spawnSync(
  process.execPath,
  [playwrightCliPath, 'install', 'ffmpeg'],
  captureOutputOptions
)

if (result.status !== 0) {
  console.error(
    'Error: failed to install Playwright ffmpeg (video recording may not work)',
    '\nplatform:',
    process.platform,
    '\nstatus:',
    result.status,
    '\nsignal:',
    result.signal,
    '\nerror:',
    result.error,
    '\nstdout:',
    result.stdout,
    '\nstderr:',
    result.stderr
  )
}
