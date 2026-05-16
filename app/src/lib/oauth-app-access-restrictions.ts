import { APIError } from './http'
import { getBoolean, setBoolean } from './local-storage'

const oauthAppAccessRestrictionsRe = /oauth app access restrictions/i
const oauthAppAccessRestrictionsOrganizationRe =
  /`([^`]+)` organization has enabled OAuth App access restrictions/i
const automaticallyUseSystemGitForOAuthAppAccessRestrictionsKey =
  'automatically-use-system-git-for-oauth-app-access-restrictions'

export function isOAuthAppAccessRestrictionAPIError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    error.responseStatus === 403 &&
    oauthAppAccessRestrictionsRe.test(error.message)
  )
}

export function getOAuthAppAccessRestrictionOrganization(
  error: unknown
): string | null {
  if (!isOAuthAppAccessRestrictionAPIError(error)) {
    return null
  }

  const match = oauthAppAccessRestrictionsOrganizationRe.exec(
    (error as Error).message
  )
  return match?.[1] ?? null
}

export function getAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(): boolean {
  return getBoolean(
    automaticallyUseSystemGitForOAuthAppAccessRestrictionsKey,
    false
  )
}

export function setAutomaticallyUseSystemGitForOAuthAppAccessRestrictions(
  value: boolean
) {
  setBoolean(automaticallyUseSystemGitForOAuthAppAccessRestrictionsKey, value)
}
