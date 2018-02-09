import { inc, parse } from 'semver'

import { Channel } from './channel'

export function getNextVersionNumber(
  version: string,
  channel: Channel
): string {
  const semanticVersion = parse(version)

  if (semanticVersion == null) {
    throw new Error(`Unable to parse input '${version}' into version`)
  }

  if (channel === 'production') {
    if (semanticVersion.prerelease.some(p => p.startsWith('beta'))) {
      throw new Error(
        `Unable to draft production release using beta version '${version}'`
      )
    }

    if (semanticVersion.prerelease.some(p => p.startsWith('test'))) {
      throw new Error(
        `Unable to draft production release using test version '${version}'`
      )
    }

    const nextVersion = inc(version, 'patch')

    if (nextVersion == null) {
      throw new Error(
        `Unable to increment next production version from release version '${version}'`
      )
    }

    return nextVersion
  }

  if (semanticVersion.prerelease.some(p => p.startsWith('test'))) {
    throw new Error(
      `Unable to resolve beta release using test version '${version}'`
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
