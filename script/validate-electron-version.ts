/* eslint-disable no-sync */
/// <reference path="./globals.d.ts" />

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
  production: '22.0.3',
  beta: '22.0.3',
}

const channel = getChannelToValidate()

if (channel === null) {
  console.log(
    `No need to validate the Electron version of a ${distInfo.getChannel()} build.`
  )
  process.exit(0)
}

const expectedVersion = ValidElectronVersions[channel]
const pkg: Package = require('../package.json')
const actualVersion = pkg.devDependencies?.electron

if (actualVersion !== expectedVersion) {
  console.error(
    `The Electron version for the ${channel} channel is incorrect. Expected ${expectedVersion} but found ${actualVersion}.`
  )
  process.exit(1)
}

console.log(
  `The Electron version for the ${channel} channel is correct: ${actualVersion}.`
)

function getChannelToValidate(): ChannelToValidate | null {
  const channel = distInfo.getChannel()
  return isChannelToValidate(channel) ? channel : null
}

function isChannelToValidate(channel: string): channel is ChannelToValidate {
  return Object.keys(ValidElectronVersions).includes(channel)
}
