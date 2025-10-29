/* eslint-disable no-sync */
/// <reference path="./globals.d.ts" />

import { readFileSync, existsSync } from 'fs-extra'
import { join } from 'path'

import * as distInfo from './dist-info'

type ChannelToValidate = 'production' | 'beta'

/**
 * This object states the valid/expected minimum macOS versions for each publishable
 * channel of GitHub Desktop.
 *
 * The purpose of this is to ensure that we don't accidentally publish a
 * production/beta/test build with the wrong minimum macOS version, which could
 * cause compatibility issues or prevent users from running the application.
 */
const ValidMacOSVersions: Record<ChannelToValidate, string> = {
  production: '12.0',
  beta: '12.0',
}

// Only when we get a RELEASE_CHANNEL we know we're in the middle of a deployment.
// In that case, we want to error out if the macOS version is not what we expect.
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
  console.log(`No need to validate the macOS version of a ${channel} build.`)
  process.exit(0)
}

const expectedVersion = ValidMacOSVersions[channel]

function validateMacOSVersion() {
  try {
    const actualVersion = resolveVersionInInfoPlist()

    if (actualVersion !== expectedVersion) {
      handleError(
        `The minimum macOS version for the ${channel} channel is incorrect. Expected ${expectedVersion} but found ${actualVersion}.`
      )
    }

    console.log(
      `The minimum macOS version for the ${channel} channel is correct: ${actualVersion}.`
    )
  } catch (error) {
    handleError(
      `Failed to validate macOS version: ${
        error instanceof Error ? error.message : String(error)
      }`
    )
  }
}

function isChannelToValidate(channel: string): channel is ChannelToValidate {
  return Object.keys(ValidMacOSVersions).includes(channel)
}

function resolveVersionInInfoPlist(): string {
  const infoPlistPath = join(
    __dirname,
    '..',
    'node_modules',
    'electron',
    'dist',
    'Electron.app',
    'Contents',
    'Info.plist'
  )

  if (!existsSync(infoPlistPath)) {
    throw new Error(
      `Info.plist file not found at ${infoPlistPath}. Make sure Electron is installed.`
    )
  }

  const plistContent = readFileSync(infoPlistPath, 'utf-8')

  // Simple regex-based parsing for LSMinimumSystemVersion
  // Look for the pattern: <key>LSMinimumSystemVersion</key>\s*<string>version</string>
  const versionMatch = plistContent.match(
    /<key>LSMinimumSystemVersion<\/key>\s*<string>([^<]+)<\/string>/
  )

  if (!versionMatch || !versionMatch[1]) {
    throw new Error('LSMinimumSystemVersion not found in Info.plist')
  }

  return versionMatch[1].trim()
}

// Run the validation
validateMacOSVersion()
