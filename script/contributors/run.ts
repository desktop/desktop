import * as Fs from 'fs'
import * as Path from 'path'

import { parse, SemVer } from 'semver'

function isBetaTag(version: SemVer) {
  return version.prerelease.some(p => p.startsWith('beta'))
}

function isTestTag(version: SemVer) {
  return version.prerelease.some(p => p.startsWith('test'))
}

export async function run(args: ReadonlyArray<string>): Promise<void> {
  const repositoryRoot = Path.dirname(Path.dirname(__dirname))
  console.log(`Root: ${repositoryRoot}`)

  const changelogPath = Path.join(repositoryRoot, 'changelog.json')
  const changelogBody = Fs.readFileSync(changelogPath, { encoding: 'utf8' })
  const { releases } = JSON.parse(changelogBody)

  for (const prop of Object.getOwnPropertyNames(releases)) {
    const semanticVersion = parse(prop)

    if (semanticVersion === null) {
      continue
    }

    if (isBetaTag(semanticVersion) || isTestTag(semanticVersion)) {
      continue
    }

    const entries: Array<string> = releases[prop]

    const externalContributionRe = /\. Thanks ([\@a-zA-Z0-9\-, ]*)\!$/

    const externalChangelogEntries = entries.filter(entry =>
      externalContributionRe.test(entry)
    )

    if (externalChangelogEntries.length === 0) {
      continue
    }

    const contributors: Array<string> = []

    for (const entry of externalChangelogEntries) {
      const match = externalContributionRe.exec(entry)

      if (match === null) {
        continue
      }

      // strip out any commas and the 'and' suffix at the end
      const formattedMatch = match[1].replace(',', '').replace(' and ', ' ')
      const distinctContributors = formattedMatch.split(' ')

      for (const user of distinctContributors) {
        if (contributors.indexOf(user) === -1) {
          contributors.push(user)
        }
      }
    }

    console.log(
      `${prop} has ${
        externalChangelogEntries.length
      } external contributions from ${contributors.length} unique contributors!`
    )
  }
}
