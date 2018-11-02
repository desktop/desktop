import { sort as semverSort, SemVer } from 'semver'

import { spawn } from '../changelog/spawn'
import { getLogLines } from '../changelog/git'
import {
  convertToChangelogFormat,
  getChangelogEntriesSince,
} from '../changelog/parser'

import { Channel } from './channel'
import { getNextVersionNumber } from './version'

const jsonStringify: (obj: any) => string = require('json-pretty')

async function getLatestRelease(options: {
  excludeBetaReleases: boolean
}): Promise<string> {
  const allTags = await spawn('git', ['tag'])
  let releaseTags = allTags
    .split('\n')
    .filter(tag => tag.startsWith('release-'))
    .filter(tag => tag.indexOf('-linux') === -1)
    .filter(tag => tag.indexOf('-test') === -1)

  if (options.excludeBetaReleases) {
    releaseTags = releaseTags.filter(tag => tag.indexOf('-beta') === -1)
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
    'Commit the changes (on master or as new branch) and push them to GitHub',
    'Read this to perform the release: https://github.com/desktop/desktop/blob/master/docs/process/releasing-updates.md',
  ]

  console.log("Here's what you should do next:\n")

  console.log(steps.map((value, index) => `${index + 1}. ${value}`).join('\n'))
}

export async function run(args: ReadonlyArray<string>): Promise<void> {
  try {
    await spawn('git', ['diff-index', '--quiet', 'HEAD'])
  } catch {
    throw new Error(
      `There are uncommitted changes in the working directory. Aborting...`
    )
  }

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
    if (channel === 'production') {
      const existingChangelog = getChangelogEntriesSince(previousVersion)
      const entries = [...existingChangelog]
      printInstructions(nextVersion, entries)
    } else if (channel === 'beta') {
      const { entries, omitted } = await convertToChangelogFormat(lines)

      if (omitted.length > 0) {
        console.log(`Skipping these merged PRs as 'no-notes' was set:`)

        omitted.forEach(o => {
          console.log(` - #${o.id} - ${o.title}`)
        })

        console.log()
      }
      printInstructions(nextVersion, [...entries])
    }
  }
}
