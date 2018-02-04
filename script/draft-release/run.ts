import { spawn } from './spawn'
import { sort as semverSort, SemVer } from 'semver'
import { getNextVersionNumber } from './version'

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
    console.log('we have types!?!?!?')
    return latestTag.raw
  }

  return latestTag
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

  //
  // first argument should be the channel
  const channel = args[0]

  const excludeBetaReleases = channel === 'production'
  const latestVersion = await getLatestRelease(excludeBetaReleases)
  const nextVersion = getNextVersionNumber(latestVersion, channel)

  throw new Error(
    `Drafting a release from ${latestVersion} which will be ${nextVersion}`
  )
}
