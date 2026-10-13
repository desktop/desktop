import type { Options } from '@electron/packager'

/** Require App Store Connect team API-key credentials for notarization. */
export function getNotarizationOptions(
  env: NodeJS.ProcessEnv
): NonNullable<Options['osxNotarize']> {
  const {
    APPLE_API_KEY_PATH: appleApiKey,
    APPLE_API_KEY_ID: appleApiKeyId,
    APPLE_API_ISSUER: appleApiIssuer,
  } = env

  if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) {
    throw new Error(
      'Missing or incomplete notarization API-key configuration: set APPLE_API_KEY_PATH, APPLE_API_KEY_ID, and APPLE_API_ISSUER together'
    )
  }

  return { appleApiKey, appleApiKeyId, appleApiIssuer }
}
