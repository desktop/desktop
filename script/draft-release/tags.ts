/**
 * Tag discovery functions, extracted from run.ts for use by ci.ts.
 * This avoids pulling in run.ts's full dependency chain when only
 * tag discovery is needed.
 */
import { sort as semverSort } from 'semver'
import { sh } from '../sh'

/**
 * Returns the latest release tag, according to git and semver
 * (ignores test releases)
 *
 * @param options.excludeBetaReleases - when true, filters out beta release tags
 * @param options.excludeTestReleases - when true, filters out test release tags
 */
export async function getLatestRelease(options: {
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
  const latestTag = sortedTags.at(-1)

  if (latestTag == null) {
    throw new Error('No matching release tags found')
  }

  return String(latestTag)
}
