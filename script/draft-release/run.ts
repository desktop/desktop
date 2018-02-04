import { spawn } from '../changelog/spawn'
import { getLogLines } from '../changelog/git'
import { getChangelogEntries } from '../changelog/parser'
import { sort as semverSort, SemVer } from 'semver'
import { getNextVersionNumber } from './version'

const jsonStringify: (obj: any) => string = require('json-pretty')

async function getLatestRelease(excludeBetaReleases: boolean): Promise<string> {
  const allTags = await spawn('git', ['tag'])
  let releaseTags = allTags
    .split('\n')
    .filter(tag => tag.startsWith('release-'))
    .filter(tag => tag.indexOf('-linux') === -1)
    .filter(tag => tag.indexOf('-test') === -1)

  if (excludeBetaReleases) {
    releaseTags = releaseTags.filter(tag => tag.indexOf('-beta') === -1)
  }

  const releaseVersions = releaseTags.map(tag => tag.substr(8))

  const sortedTags = semverSort(releaseVersions)
  const latestTag = sortedTags[sortedTags.length - 1]

  if (latestTag instanceof SemVer) {
    return latestTag.raw
  }

  return latestTag
}

function parseChannel(arg: string): 'production' | 'beta' {
  if (arg === 'production' || arg === 'beta') {
    return arg
  }

  throw new Error(`An invalid channel ${arg} has been provided`)
}

export async function run(args: ReadonlyArray<string>): Promise<void> {
  //try {
  //  await spawn('git', ['diff-index', '--quiet', 'HEAD'])
  //} catch {
  //  throw new Error(
  //    `There are uncommitted changes in the working directory. Aborting...`
  //  )
  //}

  if (args.length === 0) {
    throw new Error(
      `You have not specified a channel to draft this release for. Choose one of 'production' or 'beta'`
    )
  }

  const channel = parseChannel(args[0])
  const excludeBetaReleases = channel === 'production'
  const previousVersion = await getLatestRelease(excludeBetaReleases)
  const nextVersion = getNextVersionNumber(previousVersion, channel)

  const lines = await getLogLines(`release-${previousVersion}`)
  const changelogEntries = await getChangelogEntries(lines)

  console.log(`The next version should be: ${nextVersion}\n`)
  console.log('The changelog entries should be:')
  console.log(jsonStringify(changelogEntries))
}
