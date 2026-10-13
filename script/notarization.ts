import type { Options } from '@electron/packager'

/** Read notarization credentials, preferring App Store Connect team API keys. */
export function getNotarizationOptions(
  env: NodeJS.ProcessEnv
): Options['osxNotarize'] {
  const {
    APPLE_API_KEY_PATH: appleApiKey,
    APPLE_API_KEY_ID: appleApiKeyId,
    APPLE_API_ISSUER: appleApiIssuer,
    APPLE_ID: appleId,
    APPLE_ID_PASSWORD: appleIdPassword,
    APPLE_TEAM_ID: teamId,
  } = env

  if (appleApiKey || appleApiKeyId || appleApiIssuer) {
    if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
      throw new Error(
        'Incomplete notarization API-key configuration: set APPLE_API_KEY_PATH, APPLE_API_KEY_ID, and APPLE_API_ISSUER together'
      )
    }

    return { appleApiKey, appleApiKeyId, appleApiIssuer }
  }

  return appleId && appleIdPassword && teamId
    ? { appleId, appleIdPassword, teamId }
    : undefined
}
