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
import { format } from 'prettier'

const changelogPath = join(__dirname, '..', '..', 'changelog.json')

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
  object[nextVersion] = entries.sort()

  const baseSteps = [
    `Remove any entries of contributions that don't affect the end user`,
    'Update the release notes to have user-friendly summary lines',
    'For issues prefixed with [???], look at the PR to update the prefix to one of: [New], [Added], [Fixed], [Improved], [Removed]',
    'Sort the entries so that the prefixes are ordered in this way: [New], [Added], [Fixed], [Improved], [Removed]',
    'Commit the changes (on a "release" branch) and push them to GitHub',
    'Read this to perform the release: https://github.com/desktop/desktop/blob/development/docs/process/releasing-updates.md',
  ]
  if (entries.length === 0) {
    printSteps(baseSteps)
  } else {
    printSteps([
      `Concatenate this to the beginning of the 'releases' element in the changelog.json as a starting point:\n${format(
        JSON.stringify(object),
        { parser: 'json' }
      )}\n`,
      ...baseSteps,
    ])
  }
}

// adds a number to the beginning fo each line and prints them in sequence
function printSteps(steps: ReadonlyArray<string>) {
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
    return
  }
  console.log(`Setting app version to "${nextVersion}" in app/package.json...`)
  // this can throw and that's okay!
  execSync(`npm version ${nextVersion} --allow-same-version`, {
    cwd: join(__dirname, '..', '..', 'app'),
    encoding: 'utf8',
  })
  console.log(`Set!`)

  const currentChangelog = require(changelogPath)
  const newEntries = await getNewEntries(previousVersion, channel, lines)

  if (currentChangelog.releases[nextVersion] === undefined) {
    console.log('Adding draft release notes to changelog.json...')
    const changelog = makeNewChangelog(
      nextVersion,
      currentChangelog,
      newEntries
    )
    // this might throw and that's ok (for now!)
    writeFileSync(
      changelogPath,
      format(JSON.stringify(changelog), {
        parser: 'json',
      })
    )
    printInstructions(nextVersion, [])
  } else {
    console.log(
      `Looks like there are already release notes for ${nextVersion} in changelog.json.`
    )

    printInstructions(nextVersion, newEntries)
  }

  console.log("Here's what you should do next:\n")
}

async function getNewEntries(
  previousVersion: string,
  channel: string,
  lines: ReadonlyArray<string>
) {
  const changelogEntries = await convertToChangelogFormat(lines)
  return channel === 'production'
    ? [...getChangelogEntriesSince(previousVersion)]
    : [...changelogEntries]
}

function makeNewChangelog(
  nextVersion: string,
  currentChangelog: any,
  entries: ReadonlyArray<string>
) {
  const newChangelog: any = { releases: {} }
  newChangelog.releases[nextVersion] = entries

  for (const k of Object.keys(currentChangelog.releases)) {
    newChangelog.releases[k] = currentChangelog.releases[k]
  }
  return newChangelog
}
