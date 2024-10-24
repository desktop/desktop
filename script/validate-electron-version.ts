/* eslint-disable no-sync */
/// <reference path="./globals.d.ts" />

import { readFileSync } from 'fs-extra'
import { dirname, join } from 'path'

import * as distInfo from './dist-info'

type ChannelToValidate = 'production' | 'beta'

/**
 * This object states the valid/expected Electron versions for each publishable
 * channel of GitHub Desktop.
 *
 * The purpose of this is to ensure that we don't accidentally publish a
 * production/beta/test build with the wrong version of Electron, which could
 * cause really bad regressions to our users, and also the inability to go back
 * to a previous version of GitHub Desktop without losing all settings.
 */
const ValidElectronVersions: Record<ChannelToValidate, string> = {
  production: '30.0.8',
  beta: '32.1.2',
}

// Only when we get a RELEASE_CHANNEL we know we're in the middle of a deployment.
// In that case, we want to error out if the Electron version is not what we expect.
const errorOnMismatch = (process.env.RELEASE_CHANNEL ?? '').length > 0

function handleError(message: string): never {
  if (errorOnMismatch) {
    console.error(message)
    process.exit(1)
  } else {
    console.warn(message)
    process.exit(0)
  }
}

const channel =
  process.env.RELEASE_CHANNEL || distInfo.getChannelFromReleaseBranch()

if (!isChannelToValidate(channel)) {
  console.log(`No need to validate the Electron version of a ${channel} build.`)
  process.exit(0)
}

const expectedVersion = ValidElectronVersions[channel]
const pkg: Package = require('../package.json')
const actualVersion = pkg.devDependencies?.electron
const npmrcVersion = resolveVersionInNpmRcFile()

if (actualVersion !== expectedVersion) {
  handleError(
    `The Electron version for the ${channel} channel is incorrect. Expected ${expectedVersion} but found ${actualVersion}.`
  )
}

if (channel === 'production' && npmrcVersion !== expectedVersion) {
  handleError(
    `The Electron version for the ${channel} channel is not correct in the app/.npmrc file. Expected ${expectedVersion} but found ${npmrcVersion}.`
  )
}

console.log(
  `The Electron version for the ${channel} channel is correct: ${actualVersion}.`
)

function isChannelToValidate(channel: string): channel is ChannelToValidate {
  return Object.keys(ValidElectronVersions).includes(channel)
}

function resolveVersionInNpmRcFile() {
  const root = dirname(__dirname)
  const path = join(root, 'app', '.npmrc')
  const text = readFileSync(path, 'utf-8')
  const version = text.match(/\d+.\d+.\d+/)
  if (!version) {
    handleError(
      `No target version found in the app/.npmrc file. Is this still needed?`
    )
  }

  return version[0]
}
