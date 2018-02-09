import { inc, parse, SemVer } from 'semver'

import { Channel } from './channel'

function isBetaTag(version: SemVer) {
  return version.prerelease.some(p => p.startsWith('beta'))
}

function isTestTag(version: SemVer) {
  return version.prerelease.some(p => p.startsWith('test'))
}

export function getNextVersionNumber(
  version: string,
  channel: Channel
): string {
  const semanticVersion = parse(version)

  if (semanticVersion == null) {
    throw new Error(`Unable to parse input '${version}' into version`)
  }

  switch (channel) {
    case 'production':
      if (isBetaTag(semanticVersion)) {
        throw new Error(
          `Unable to draft production release using beta version '${version}'`
        )
      }

      if (isTestTag(semanticVersion)) {
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

    case 'beta':
      if (isTestTag(semanticVersion)) {
        throw new Error(
          `Unable to draft beta release using test version '${version}'`
        )
      }

      const betaTagIndex = version.indexOf('-beta')
      if (betaTagIndex > -1) {
        const betaNumber = version.substr(betaTagIndex + 5)
        const newBeta = parseInt(betaNumber, 10) + 1

        const newVersion = version.replace(
          `-beta${betaNumber}`,
          `-beta${newBeta}`
        )
        return newVersion
      } else {
        const nextVersion = inc(version, 'patch')
        const firstBeta = `${nextVersion}-beta1`
        return firstBeta
      }

    default:
      throw new Error(
        `Resolving the next version is not implemented for channel ${channel}`
      )
  }
}
