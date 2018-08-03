#!/usr/bin/env ts-node

import * as Path from 'path'
import { spawnSync, SpawnSyncOptions } from 'child_process'

import * as glob from 'glob'

const root = Path.dirname(__dirname)

const options: SpawnSyncOptions = {
  cwd: root,
  stdio: 'inherit',
}

function findYarnVersion(callback: (path: string) => void) {
  glob('vendor/yarn-*.js', options, (error, files) => {
    if (error != null) {
      throw error
    }

    files.sort()

    const foundVersion = files[files.length - 1]

    callback(foundVersion)
  })
}

findYarnVersion(path => {
  let result = spawnSync(
    'node',
    [path, '--cwd', 'app', 'install', '--force'],
    options
  )

  if (result.status !== 0) {
    process.exit(result.status)
  }

  result = spawnSync(
    'git',
    ['submodule', 'update', '--recursive', '--init'],
    options
  )

  if (result.status !== 0) {
    process.exit(result.status)
  }

  result = spawnSync('node', [path, 'compile:tslint'], options)

  if (result.status !== 0) {
    process.exit(result.status)
  }

  result = spawnSync('node', [path, 'compile:script'], options)

  if (result.status !== 0) {
    process.exit(result.status)
  }
})
