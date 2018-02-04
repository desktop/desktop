import { inc, parse } from 'semver'

export function getNextVersionNumber(
  version: string,
  channel: 'production' | 'beta'
): string {
  const parsed = parse(version)

  if (parsed == null) {
    throw new Error(`Unable to parse input '${version}' into version`)
  }

  if (channel === 'production') {
    if (parsed.prerelease.some(p => p.startsWith('beta'))) {
      throw new Error(
        `Unable to resolve production version using beta release '${version}'`
      )
    }

    if (parsed.prerelease.some(p => p.startsWith('test'))) {
      throw new Error(
        `Unable to resolve production version using test release '${version}'`
      )
    }

    const nextVersion = inc(version, 'patch')

    if (nextVersion == null) {
      throw new Error(
        `Unable to resolve next version from release '${version}'`
      )
    }

    return nextVersion
  }

  if (parsed.prerelease.some(p => p.startsWith('test'))) {
    throw new Error(
      `Unable to resolve production version using test release '${version}'`
    )
  }

  const betaTagIndex = version.indexOf('-beta')
  if (betaTagIndex > -1) {
    const betaNumber = version.substr(betaTagIndex + 5)
    const newBeta = parseInt(betaNumber, 10) + 1

    const newVersion = version.replace(`-beta${betaNumber}`, `-beta${newBeta}`)
    return newVersion
  } else {
    const nextVersion = inc(version, 'patch')
    const firstBeta = `${nextVersion}-beta1`
    return firstBeta
  }
}
