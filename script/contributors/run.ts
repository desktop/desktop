import * as Fs from 'fs'
import * as Path from 'path'

import { parse, SemVer } from 'semver'

function isBetaTag(version: SemVer) {
  return version.prerelease.some(p => p.startsWith('beta'))
}

function isTestTag(version: SemVer) {
  return version.prerelease.some(p => p.startsWith('test'))
}

const externalContributionRe = /\. Thanks ([\@a-zA-Z0-9\-, ]*)\!$/

function getContributors(entry: string): ReadonlyArray<string> {
  const contributorsMatch = externalContributionRe.exec(entry)
  if (contributorsMatch === null) {
    return []
  }

  // strip out any commas and the 'and' suffix at the end
  const formattedMatch = contributorsMatch[1]
    .replace(',', '')
    .replace(' and ', ' ')
  return formattedMatch.split(' ')
}

function getIdentifier(entry: string): string | null {
  const idMatch = /\#\d{1,}/.exec(entry)
  if (idMatch === null) {
    return null
  }
  return idMatch[0]
}

function getListForNextBigRelease(releases: any) {
  const oneOneOne: Array<string> = releases['1.1.1']
  const oneTwoOh: Array<string> = releases['1.2.0']

  const contributors: Array<string> = []

  const pullRequestIds: Array<string> = []

  for (const entry of oneOneOne) {
    const distinctContributors = getContributors(entry)
    if (distinctContributors.length === 0) {
      continue
    }

    const id = getIdentifier(entry)
    if (id === null) {
      continue
    }

    if (pullRequestIds.indexOf(id) === -1) {
      pullRequestIds.push(id)
    }

    for (const user of distinctContributors) {
      if (contributors.indexOf(user) === -1) {
        contributors.push(user)
      }
    }
  }

  for (const entry of oneTwoOh) {
    const distinctContributors = getContributors(entry)
    if (distinctContributors.length === 0) {
      continue
    }

    const id = getIdentifier(entry)
    if (id === null) {
      continue
    }

    if (pullRequestIds.indexOf(id) === -1) {
      pullRequestIds.push(id)
    }

    for (const user of distinctContributors) {
      if (contributors.indexOf(user) === -1) {
        contributors.push(user)
      }
    }
  }

  pullRequestIds.sort()
  contributors.sort()

  const idsText = pullRequestIds.join(', ')
  const contributorsText = contributors.join(', ')

  console.log('For the 1.2.0 release:')
  console.log(` - Contributions: ${pullRequestIds.length} - ${idsText}`)
  console.log(` - Contributors: ${contributors.length} - ${contributorsText}`)
}

function enumerateStableReleases(releases: any) {
  for (const prop of Object.getOwnPropertyNames(releases)) {
    const semanticVersion = parse(prop)

    if (semanticVersion === null) {
      continue
    }

    if (isBetaTag(semanticVersion) || isTestTag(semanticVersion)) {
      continue
    }

    const entries: Array<string> = releases[prop]

    const externalChangelogEntries = entries.filter(entry =>
      externalContributionRe.test(entry)
    )

    if (externalChangelogEntries.length === 0) {
      continue
    }

    const contributors: Array<string> = []

    const pullRequestIds: Array<string> = []

    for (const entry of externalChangelogEntries) {
      const distinctContributors = getContributors(entry)

      if (distinctContributors.length === 0) {
        continue
      }

      const id = getIdentifier(entry)
      if (id === null) {
        continue
      }

      if (pullRequestIds.indexOf(id) === -1) {
        pullRequestIds.push(id)
      }

      for (const user of distinctContributors) {
        if (contributors.indexOf(user) === -1) {
          contributors.push(user)
        }
      }
    }

    pullRequestIds.sort()
    contributors.sort()

    const idsText = pullRequestIds.join(', ')
    const contributorsText = contributors.join(', ')

    console.log(`Version: ${prop}`)
    console.log(` - Contributions: ${pullRequestIds.length} - ${idsText}`)
    console.log(` - Contributors: ${contributors.length} - ${contributorsText}`)
  }
}

export async function run(args: ReadonlyArray<string>): Promise<void> {
  const repositoryRoot = Path.dirname(Path.dirname(__dirname))
  const changelogBody = Fs.readFileSync(
    Path.join(repositoryRoot, 'changelog.json'),
    { encoding: 'utf8' }
  )
  const { releases } = JSON.parse(changelogBody)

  getListForNextBigRelease(releases)
  console.log()
  console.log()
  console.log()
  enumerateStableReleases(releases)
}
