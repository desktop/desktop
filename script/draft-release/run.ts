import { sort as semverSort, SemVer } from 'semver'

import { spawn } from '../changelog/spawn'
import { getLogLines } from '../changelog/git'
import {
  convertToChangelogFormat,
  getChangelogEntriesSince,
} from '../changelog/parser'

import { Channel } from './channel'
import { getNextVersionNumber } from './version'
import { execSync } from 'child_process'

import { writeFileSync } from 'fs'
import { join } from 'path'

const changelogPath = join(__dirname, '..', '..', 'changelog.json')

const jsonStringify: (obj: any) => string = require('json-pretty')

async function getLatestRelease(options: {
  excludeBetaReleases: boolean
}): Promise<string> {
  const allTags = await spawn('git', ['tag'])
  let releaseTags = allTags
    .split('\n')
    .filter(tag => tag.startsWith('release-'))
    .filter(tag => !tag.includes('-linux'))
    .filter(tag => !tag.includes('-test'))

  if (options.excludeBetaReleases) {
    releaseTags = releaseTags.filter(tag => !tag.includes('-beta'))
  }

  const releaseVersions = releaseTags.map(tag => tag.substr(8))

  const sortedTags = semverSort(releaseVersions)
  const latestTag = sortedTags[sortedTags.length - 1]

  return latestTag instanceof SemVer ? latestTag.raw : latestTag
}

function parseChannel(arg: string): Channel {
  if (arg === 'production' || arg === 'beta' || arg === 'test') {
    return arg
  }

  throw new Error(`An invalid channel ${arg} has been provided`)
}

function printInstructions(nextVersion: string, entries: Array<string>) {
  const object: any = {}
  object[`${nextVersion}`] = entries.sort()

  const steps = [
    `Update the app/package.json 'version' to '${nextVersion}' (make sure this aligns with semver format of 'major.minor.patch')`,
    `Concatenate this to the beginning of the 'releases' element in the changelog.json as a starting point:\n${jsonStringify(
      object
    )}\n`,
    `Remove any entries of contributions that don't affect the end user`,
    'Update the release notes to have user-friendly summary lines',
    'For issues prefixed with [???], look at the PR to update the prefix to one of: [New], [Added], [Fixed], [Improved], [Removed]',
    'Sort the entries so that the prefixes are ordered in this way: [New], [Added], [Fixed], [Improved], [Removed]',
    'Commit the changes (on development or as new branch) and push them to GitHub',
    'Read this to perform the release: https://github.com/desktop/desktop/blob/development/docs/process/releasing-updates.md',
  ]

  console.log(steps.map((value, index) => `${index + 1}. ${value}`).join('\n'))
}

export async function run(args: ReadonlyArray<string>): Promise<void> {
  if (args.length === 0) {
    throw new Error(
      `You have not specified a channel to draft this release for. Choose one of 'production' or 'beta'`
    )
  }

  const channel = parseChannel(args[0])
  const excludeBetaReleases = channel === 'production'
  const previousVersion = await getLatestRelease({ excludeBetaReleases })
  const nextVersion = getNextVersionNumber(previousVersion, channel)

  const lines = await getLogLines(`release-${previousVersion}`)
  const noChangesFound = lines.every(l => l.trim().length === 0)

  if (noChangesFound) {
    printInstructions(nextVersion, [])
  } else {
    console.log(
      `Setting app version to "${nextVersion}" in app/package.json...`
    )
    // this can throw and that's okay!
    execSync(`npm version ${nextVersion}`, {
      cwd: 'app',
      encoding: 'utf8',
    })
    console.log(`Set!`)

    const changelogEntries = await convertToChangelogFormat(lines)
    const changelog = require(changelogPath)
    changelog.releases[nextVersion] = changelogEntries

    // this might throw and that's ok (for now!)
    writeFileSync(changelogPath, jsonStringify(changelog))

    console.log("Here's what you should do next:\n")

    if (channel === 'production') {
      const existingChangelog = getChangelogEntriesSince(previousVersion)
      const entries = [...existingChangelog]
      printInstructions(nextVersion, entries)
    } else if (channel === 'beta') {
      const entries = [...changelogEntries]
      printInstructions(nextVersion, entries)
    }
  }
}
