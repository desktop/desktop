import { isGHE } from './endpoint-capabilities'

/**
 * Get the canonical API endpoint for a ghe.com endpoint which may have been
 * persisted in a legacy format.
 *
 * Previous versions of Desktop have persisted ghe.com API endpoints either
 * using the GHES format (https://example.ghe.com/api/v3) or with a trailing
 * slash (https://api.example.ghe.com/). The canonical format, matching what
 * `getEnterpriseAPIURL` produces, is https://api.example.ghe.com.
 *
 * Returns undefined if the endpoint isn't a ghe.com endpoint or if it's
 * already in the canonical format.
 */
export function getMigratedGHEEndpoint(endpoint: string): string | undefined {
  if (!isGHE(endpoint)) {
    return undefined
  }

  const { host, hostname } = new URL(endpoint)
  const canonical = hostname.startsWith('api.')
    ? `https://${host}`
    : `https://api.${host}`

  return canonical === endpoint ? undefined : canonical
}

/**
 * Get the legacy formats in which the given canonical ghe.com API endpoint
 * may have been persisted by previous versions of Desktop (see
 * `getMigratedGHEEndpoint`).
 *
 * Returns an empty array for endpoints which aren't canonical ghe.com API
 * endpoints.
 */
export function getLegacyGHEEndpoints(endpoint: string): ReadonlyArray<string> {
  if (!isGHE(endpoint)) {
    return []
  }

  const { host, hostname } = new URL(endpoint)

  if (!hostname.startsWith('api.')) {
    return []
  }

  const htmlHostname = hostname.substring('api.'.length)
  return [`https://${host}/`, `https://${htmlHostname}/api/v3`]
}
