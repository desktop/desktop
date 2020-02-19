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

/**
 * Returns the latest release tag, according to git and semver
 * (ignores test releases)
 *
 * @param options there's only one option `excludeBetaReleases`,
 *                which is a boolean
 */
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

/** Converts a string to Channel type if possible */
function parseChannel(arg: string): Channel {
  if (arg === 'production' || arg === 'beta' || arg === 'test') {
    return arg
  }

  throw new Error(`An invalid channel ${arg} has been provided`)
}

/**
 * Prints out next steps to the console
 *
 * @param nextVersion version for the next release
 * @param entries release notes for the next release
 */
function printInstructions(nextVersion: string, entries: Array<string>) {
  const baseSteps = [
    'Revise the release notes according to https://github.com/desktop/desktop/blob/development/docs/process/writing-release-notes.md',
    'Lint them with: yarn draft-release:format',
    'Commit these changes (on a "release" branch) and push them to GitHub',
    'Read this to perform the release: https://github.com/desktop/desktop/blob/development/docs/process/releasing-updates.md',
  ]
  // if an empty list, we assume the new entries have already been
  // written to the changelog file
  if (entries.length === 0) {
    printSteps(baseSteps)
  } else {
    const object: any = {}
    object[nextVersion] = entries.sort()
    const steps = [
      `Concatenate this to the beginning of the 'releases' element in the changelog.json as a starting point:\n${format(
        JSON.stringify(object),
        {
          parser: 'json',
        }
      )}\n`,
      ...baseSteps,
    ]
    printSteps(steps)
  }
}

/**
 * adds a number to the beginning fo each line and prints them in sequence
 */
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
    console.warn('No new changes found to add to the changelog. Aborting.')
    // print instructions with no changelog included
    printInstructions(nextVersion, [])
    return
  }
  console.log(`Setting app version to "${nextVersion}" in app/package.json...`)

  try {
    // this can throw
    // sets the npm version in app/
    execSync(`npm version ${nextVersion} --allow-same-version`, {
      cwd: join(__dirname, '..', '..', 'app'),
      encoding: 'utf8',
    })
    console.log(`Set!`)
  } catch (e) {
    console.warn(`Setting the app version failed 😿
    (${e.message})
    Please manually set it to ${nextVersion} in app/package.json.`)
  }

  const currentChangelog = require(changelogPath)
  // if it's a new production release, make sure we only include
  // entries since the latest production release
  const newEntries =
    channel === 'production'
      ? [...getChangelogEntriesSince(previousVersion)]
      : [...(await convertToChangelogFormat(lines))]

  if (currentChangelog.releases[nextVersion] === undefined) {
    console.log('Adding draft release notes to changelog.json...')
    const changelog = makeNewChangelog(
      nextVersion,
      currentChangelog,
      newEntries
    )
    try {
      // this might throw
      writeFileSync(
        changelogPath,
        format(JSON.stringify(changelog), {
          parser: 'json',
        })
      )
      printInstructions(nextVersion, [])
    } catch (e) {
      console.warn(`Writing the changelog failed 😿\n(${e.message})`)
      printInstructions(nextVersion, newEntries)
    }
  } else {
    console.log(
      `Looks like there are already release notes for ${nextVersion} in changelog.json.`
    )

    printInstructions(nextVersion, newEntries)
  }

  console.log("Here's what you should do next:\n")
}

/**
 * Returns the current changelog with new entries added.
 * Ensures that the new entry will appear at the beginning
 * of the object when printed.
 */
function makeNewChangelog(
  nextVersion: string,
  currentChangelog: { releases: Object },
  entries: ReadonlyArray<string>
) {
  const newChangelogEntries: any = {}
  newChangelogEntries[nextVersion] = entries
  return {
    releases: { ...newChangelogEntries, ...currentChangelog.releases },
  }
}
