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

    console.log(`Version: ${prop} has ${entries.length} entries`)
  }
}
