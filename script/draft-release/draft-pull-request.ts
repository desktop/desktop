/// <reference path="../globals.d.ts" />

import appPackage from '../../app/package.json'
import { createPR } from '../pr-api'

const numberToOrdinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

function getPullRequestBody(fullVersion: string): string {
  const versionComponents = fullVersion.split('-')
  const version = versionComponents[0]

  let releaseDescription = `v${version} production release`
  if (versionComponents.length > 1) {
    const channelVersion = versionComponents[1]
    if (!channelVersion.startsWith('beta')) {
      throw new Error('We should not create release PRs for test builds')
    }

    const buildNumber = parseInt(channelVersion.substring('beta'.length))
    releaseDescription = `${numberToOrdinal(
      buildNumber
    )} beta of the v${version} series`
  }

  return `## Description
Looking for the PR for the upcoming ${releaseDescription}? Well, you've just found it, congratulations!

## Release checklist

- [ ] Check to see if there are any errors in Sentry that have only occurred since the last production release
- [ ] Verify that all feature flags are flipped appropriately
- [ ] If there are any new metrics, ensure that central and desktop.github.com have been updated
`
}

function getPullRequestTitle(fullVersion: string): string {
  return `Release ${fullVersion}`
}

process.on('unhandledRejection', error => {
  console.error(error.message)
})

async function run() {
  const version = appPackage.version
  console.log(`Creating release Pull Request for ${version}...`)
  const title = getPullRequestTitle(version)
  const body = getPullRequestBody(version)
  const response = await createPR(title, body, `releases/${version}`)
  if (response === null) {
    console.error('Failed to create release Pull Request')
    process.exit(1)
  }
  console.log(`Done: ${response.permalink}`)
}

run()
