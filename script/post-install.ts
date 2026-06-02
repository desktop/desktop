#!/usr/bin/env ts-node
/* eslint-disable no-sync */

import * as Path from 'path'
import * as Fs from 'fs'
import * as Os from 'os'
import { spawnSync, SpawnSyncOptions } from 'child_process'

import glob from 'glob'
import { forceUnwrap } from '../app/src/lib/fatal-error'

const root = Path.dirname(__dirname)

const options: SpawnSyncOptions = {
  cwd: root,
  stdio: 'inherit',
}

const captureOutputOptions: SpawnSyncOptions = {
  cwd: root,
  encoding: 'utf8',
}

function run(
  command: string,
  args: string[],
  options = {} as SpawnSyncOptions
) {
  return spawnSync(command, args, {
    ...options,
    cwd: root,
    stdio: 'inherit',
  })
}

function getElectronVersion() {
  const npmrc = Fs.readFileSync(Path.join(root, 'app', '.npmrc'), 'utf8')
  const match = /^target\s*=\s*(.+)$/m.exec(npmrc)

  return forceUnwrap('Missing Electron target in app/.npmrc', match?.[1]).trim()
}

function download(url: string, destination: string) {
  Fs.mkdirSync(Path.dirname(destination), { recursive: true })

  const result = run('curl.exe', [
    '--fail',
    '--location',
    '--retry',
    '10',
    '--retry-delay',
    '2',
    '--retry-all-errors',
    '--continue-at',
    '-',
    '--output',
    destination,
    url,
  ])

  if (result.status !== 0) {
    throw new Error(`Unable to download ${url}`)
  }
}

function prepareWindowsElectronHeaders() {
  const electronVersion = getElectronVersion()
  const headersRoot = Path.join(
    Os.tmpdir(),
    `electron-v${electronVersion}-local`
  )
  const includeDirectory = Path.join(headersRoot, 'include', 'node')
  const releaseNodeLib = Path.join(headersRoot, 'Release', 'node.lib')
  const distUrl =
    process.env.DESKTOP_ELECTRON_HEADERS_DIST_URL ??
    'https://artifacts.electronjs.org/headers/dist'

  console.warn(
    `Retrying app dependency installation with cached Electron ${electronVersion} headers.`
  )

  if (!Fs.existsSync(includeDirectory)) {
    const archivePath = Path.join(
      Os.tmpdir(),
      `electron-v${electronVersion}-headers.tar.gz`
    )

    download(
      `${distUrl}/v${electronVersion}/node-v${electronVersion}-headers.tar.gz`,
      archivePath
    )
    Fs.mkdirSync(headersRoot, { recursive: true })

    const result = run('tar.exe', [
      '-xf',
      archivePath,
      '-C',
      headersRoot,
      '--strip-components=1',
    ])

    if (result.status !== 0) {
      throw new Error(`Unable to extract ${archivePath}`)
    }
  }

  if (!Fs.existsSync(releaseNodeLib)) {
    download(`${distUrl}/v${electronVersion}/win-x64/node.lib`, releaseNodeLib)
  }

  return headersRoot
}

function installAppDependencies(yarnPath: string, env = process.env) {
  return run('node', [yarnPath, '--cwd', 'app', 'install', '--force'], {
    env,
  })
}

// Some Windows CI runners do not expose an `npx` executable on PATH, so
// invoke the locally installed Playwright CLI through the current Node binary.
// Resolve from the exported package root since `playwright/cli` is not exported.
const playwrightPackagePath = require.resolve('playwright/package.json')
const playwrightCliPath = Path.join(
  Path.dirname(playwrightPackagePath),
  'cli.js'
)

function findYarnVersion(callback: (path: string) => void) {
  glob('vendor/yarn-*.js', (error, files) => {
    if (error != null) {
      throw error
    }

    // this ensures the paths returned by glob are sorted alphabetically
    files.sort()

    // use the latest version here if multiple are found
    callback(forceUnwrap('Missing vendored yarn', files.at(-1)))
  })
}

findYarnVersion(path => {
  let result = installAppDependencies(path)

  if (result.status !== 0 && process.platform === 'win32') {
    const nodedir = prepareWindowsElectronHeaders()
    result = installAppDependencies(path, {
      ...process.env,
      npm_config_nodedir: nodedir,
    })
  }

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

  result = spawnSync('node', [path, 'compile:script'], options)

  if (result.status !== 0) {
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
})
