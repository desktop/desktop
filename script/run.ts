'use strict'

import { join } from 'path'
import { spawn, SpawnOptions } from 'child_process'
import { statSync } from 'fs'
import { getDistPath, getExecutableName } from './dist-info'

import { assertNever } from '../app/src/lib/fatal-error'

const distPath = getDistPath()
const productName = getExecutableName()

let binaryPath = ''
if (process.platform === 'darwin') {
  binaryPath = join(
    distPath,
    `${productName}.app`,
    'Contents',
    'MacOS',
    `${productName}`
  )
} else if (process.platform === 'win32') {
  binaryPath = join(distPath, `${productName}.exe`)
} else if (process.platform === 'linux') {
  binaryPath = join(distPath, productName)
} else if (
  process.platform === 'aix' ||
  process.platform === 'android' ||
  process.platform === 'freebsd' ||
  process.platform === 'openbsd' ||
  process.platform === 'sunos'
) {
  console.error(`I dunno how to run on ${process.platform} ${process.arch} :(`)
  process.exit(1)
} else {
  assertNever(process.platform, `Unknown platform ${process.platform}`)
}

export function run(spawnOptions: SpawnOptions) {
  try {
    const stats = statSync(binaryPath)
    if (!stats.isFile()) {
      return null
    }
  } catch (e) {
    return null
  }

  const opts = Object.assign({}, spawnOptions)

  opts.env = Object.assign(opts.env || {}, process.env, {
    NODE_ENV: 'development',
  })

  return spawn(binaryPath, [], opts)
}
