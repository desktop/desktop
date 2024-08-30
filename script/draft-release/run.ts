import { sort as semverSort, SemVer } from 'semver'

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
import { assertNever, forceUnwrap } from '../../app/src/lib/fatal-error'
import { sh } from '../sh'
import { readFile } from 'fs/promises'

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
  excludeTestReleases: boolean
}): Promise<string> {
  let releaseTags = (await sh('git', 'tag'))
    .split('\n')
    .filter(tag => tag.startsWith('release-'))
    .filter(tag => !tag.includes('-linux'))

  if (options.excludeBetaReleases) {
    releaseTags = releaseTags.filter(tag => !tag.includes('-beta'))
  }

  if (options.excludeTestReleases) {
    releaseTags = releaseTags.filter(tag => !tag.includes('-test'))
  }

  const releaseVersions = releaseTags.map(tag => tag.substring(8))

  const sortedTags = semverSort(releaseVersions)
  const latestTag = forceUnwrap(`No tags`, sortedTags.at(-1))

  return latestTag instanceof SemVer ? latestTag.raw : latestTag
}

async function createReleaseBranch(version: string): Promise<void> {
  try {
    const versionBranch = `releases/${version}`
    const currentBranch = (
      await sh('git', 'rev-parse', '--abbrev-ref', 'HEAD')
    ).trim()
    if (currentBranch !== versionBranch) {
      await sh('git', 'checkout', '-b', versionBranch)
    }
  } catch (error) {
    console.log(`Failed to create release branch: ${error}`)
  }
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
    'See the deploy repo for details on performing the release: https://github.com/desktop/deploy',
  ]
  // if an empty list, we assume the new entries have already been
  // written to the changelog file
  if (entries.length === 0) {
    printSteps(baseSteps)
  } else {
    const object = { [nextVersion]: entries.sort() }
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
 * adds a number to the beginning of each line and prints them in sequence
 */
function printSteps(steps: ReadonlyArray<string>) {
  console.log("Here's what you should do next:\n")
  console.log(steps.map((value, index) => `${index + 1}. ${value}`).join('\n'))
}

export async function run(args: ReadonlyArray<string>): Promise<void> {
  if (args.length === 0) {
    throw new Error(
      `You have not specified a channel to draft this release for. Choose one of 'production' or 'beta'`
    )
  }

  const channel = parseChannel(args[0])
  const draftPretext = args[1] === '--pretext'
  const previousVersion = await getLatestRelease({
    excludeBetaReleases: channel === 'production' || channel === 'test',
    excludeTestReleases: channel === 'production' || channel === 'beta',
  })
  const nextVersion = getNextVersionNumber(previousVersion, channel)

  console.log(`Creating release branch for "${nextVersion}"...`)
  createReleaseBranch(nextVersion)
  console.log(`Done!`)

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
    (${e instanceof Error ? e.message : e})
    Please manually set it to ${nextVersion} in app/package.json.`)
  }

  console.log('Determining changelog entries...')

  const currentChangelog: IChangelog = require(changelogPath)
  const newEntries = new Array<string>()

  if (draftPretext) {
    const pretext = await getPretext()
    if (pretext !== null) {
      newEntries.push(pretext)
    }
  }

  switch (channel) {
    case 'production': {
      // if it's a new production release, make sure we only include
      // entries since the latest production release
      newEntries.push(...getChangelogEntriesSince(previousVersion))
      break
    }
    case 'beta': {
      const logLines = await getLogLines(`release-${previousVersion}`)
      const changelogLines = await convertToChangelogFormat(logLines)
      newEntries.push(...changelogLines)
      break
    }
    case 'test': {
      // we don't guess at release notes for test releases
      break
    }
    default: {
      assertNever(channel, 'missing channel type')
    }
  }

  if (newEntries.length === 0 && channel !== 'test') {
    console.warn(
      'No new changes found to add to the changelog. 🤔 Continuing...'
    )
  } else {
    console.log('Determined!')
  }

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
      console.log('Added!')
      printInstructions(nextVersion, [])
    } catch (e) {
      console.warn(
        `Writing the changelog failed 😿\n(${
          e instanceof Error ? e.message : e
        })`
      )
      printInstructions(nextVersion, newEntries)
    }
  } else {
    console.log(
      `Looks like there are already release notes for ${nextVersion} in changelog.json.`
    )

    printInstructions(nextVersion, newEntries)
  }
}

/**
 * Returns the current changelog with new entries added.
 * Ensures that the new entry will appear at the beginning
 * of the object when printed.
 */
function makeNewChangelog(
  nextVersion: string,
  currentChangelog: IChangelog,
  entries: ReadonlyArray<string>
): IChangelog {
  return {
    releases: { [nextVersion]: entries, ...currentChangelog.releases },
  }
}

type ChangelogReleases = { [key: string]: ReadonlyArray<string> }

interface IChangelog {
  releases: ChangelogReleases
}

async function getPretext(): Promise<string | null> {
  const pretextPath = join(
    __dirname,
    '..',
    '..',
    'app',
    'static',
    'common',
    'pretext-draft.md'
  )
  const pretext = await readFile(pretextPath, 'utf8')
  if (pretext.trim() === '') {
    return null
  }
  return `[Pretext] ${pretext}`
}
