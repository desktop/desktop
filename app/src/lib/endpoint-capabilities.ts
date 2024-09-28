import * as semver from 'semver'
import { getDotComAPIEndpoint } from './api'
import { assertNonNullable } from './fatal-error'

export type VersionConstraint = {
  /**
   * Whether this constrain will be satisfied when using GitHub.com, defaults
   * to false
   **/
  dotcom?: boolean
  /**
   * Whether this constrain will be satisfied when using ghe.com, defaults to
   * the value of `dotcom` if not specified
   */
  ghe?: boolean
  /**
   * Whether this constrain will be satisfied when using GitHub Enterprise
   * Server. Supports specifying a version constraint as a SemVer Range (ex: >=
   * 3.1.0), defaults to false
   */
  es?: boolean | string
}

/**
 * If we're connected to a GHES instance but it doesn't report a version
 * number (either because of corporate proxies that strip the version
 * header or because GHES stops sending the version header in the future)
 * we'll assume it's this version.
 *
 * This should correspond loosely with the oldest supported GHES series and
 * needs to be updated manually.
 */
const assumedGHESVersion = new semver.SemVer('3.1.0')

/** Stores raw x-github-enterprise-version headers keyed on endpoint */
const rawVersionCache = new Map<string, string>()

/** Stores parsed x-github-enterprise-version headers keyed on endpoint */
const versionCache = new Map<string, semver.SemVer | null>()

/** Get the cache key for a given endpoint address */
const endpointVersionKey = (ep: string) => `endpoint-version:${ep}`

/**
 * Whether or not the given endpoint belong's to GitHub.com
 */
export const isDotCom = (ep: string) => {
  if (ep === getDotComAPIEndpoint()) {
    return true
  }

  const { hostname } = new URL(ep)
  return hostname === 'api.github.com' || hostname === 'github.com'
}

export const isGist = (ep: string) => {
  const { hostname } = new URL(ep)
  return hostname === 'gist.github.com' || hostname === 'gist.ghe.io'
}

/** Whether or not the given endpoint URI is under the ghe.com domain */
export const isGHE = (ep: string) => new URL(ep).hostname.endsWith('.ghe.com')

/**
 * Whether or not the given endpoint URI appears to point to a GitHub Enterprise
 * Server instance
 */
export const isGHES = (ep: string) => !isDotCom(ep) && !isGHE(ep)

export function getEndpointVersion(endpoint: string) {
  const key = endpointVersionKey(endpoint)
  const cached = versionCache.get(key)

  if (cached !== undefined) {
    return cached
  }

  const raw = localStorage.getItem(key)
  const parsed = raw === null ? null : semver.parse(raw)

  if (parsed !== null) {
    versionCache.set(key, parsed)
  }

  return parsed
}

/**
 * Update the known version number for a given endpoint
 */
export function updateEndpointVersion(endpoint: string, version: string) {
  const key = endpointVersionKey(endpoint)

  if (rawVersionCache.get(key) !== version) {
    const parsed = semver.parse(version)
    localStorage.setItem(key, version)
    rawVersionCache.set(key, version)
    versionCache.set(key, parsed)
  }
}

function checkConstraint(
  epConstraint: string | boolean | undefined,
  epMatchesType: boolean,
  epVersion?: semver.SemVer
) {
  // Denial of endpoint type regardless of version
  if (epConstraint === undefined || epConstraint === false) {
    return false
  }

  // Approval of endpoint type regardless of version
  if (epConstraint === true) {
    return epMatchesType
  }

  // Version number constraint
  assertNonNullable(epVersion, `Need to provide a version to compare against`)
  return epMatchesType && semver.satisfies(epVersion, epConstraint)
}

/**
 * Returns a predicate which verifies whether a given endpoint matches the
 * provided constraints.
 *
 * Note: NOT meant for direct consumption, only exported for testability reasons.
 *       Consumers should use the various `supports*` methods instead.
 */
export const endpointSatisfies =
  ({ dotcom, ghe, es }: VersionConstraint, getVersion = getEndpointVersion) =>
  (ep: string) =>
    checkConstraint(dotcom, isDotCom(ep)) ||
    checkConstraint(ghe ?? dotcom, isGHE(ep)) ||
    checkConstraint(es, isGHES(ep), getVersion(ep) ?? assumedGHESVersion)

/**
 * Whether or not the endpoint supports the internal GitHub Enterprise Server
 * avatars API
 */
export const supportsAvatarsAPI = endpointSatisfies({ es: '>= 3.0.0' })

export const supportsRerunningChecks = endpointSatisfies({
  dotcom: true,
  es: '>= 3.4.0',
})

export const supportsRerunningIndividualOrFailedChecks = endpointSatisfies({
  dotcom: true,
})

/**
 * Whether or not the endpoint supports the retrieval of action workflows by
 * check suite id.
 */
export const supportsRetrieveActionWorkflowByCheckSuiteId = endpointSatisfies({
  dotcom: true,
})

export const supportsAliveSessions = endpointSatisfies({ dotcom: true })

export const supportsRepoRules = endpointSatisfies({ dotcom: true })
