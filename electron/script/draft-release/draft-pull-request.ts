/// <reference path="../globals.d.ts" />

import appPackage from '../../app/package.json'
import { createPR } from '../pr-api'
import { sh } from '../sh'

async function getPullRequestContent(
  contentType: 'title' | 'body',
  fullVersion: string
): Promise<string> {
  const result = await sh(
    './script/draft-release/release-pr-content.sh',
    contentType,
    fullVersion
  )
  return result.trim()
}

const getPullRequestBody = (fullVersion: string) =>
  getPullRequestContent('body', fullVersion)
const getPullRequestTitle = (fullVersion: string) =>
  getPullRequestContent('title', fullVersion)

process.on('unhandledRejection', error => {
  console.error(error.message)
})

async function run() {
  const version = appPackage.version
  if (version.includes('test')) {
    console.error('Cannot create a PR for a test version')
    process.exit(1)
  }

  console.log(`Creating release Pull Request for ${version}...`)
  const title = await getPullRequestTitle(version)
  const body = await getPullRequestBody(version)
  const response = createPR(title, body, `releases/${version}`)
  if (response === null) {
    console.error('Failed to create release Pull Request')
    process.exit(1)
  }
  console.log(`Done: ${response.url}`)
}

run()
