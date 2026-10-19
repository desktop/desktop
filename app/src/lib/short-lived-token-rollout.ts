import { getVersion } from '../ui/lib/app-proxy'
import { isGHES } from './endpoint-capabilities'
import { enableShortLivedTokens } from './feature-flag'
import { getRendererGUID } from './get-renderer-guid'
import { getUserAgent } from './http'
import { isRecord } from './is-record'

const FeatureEndpoint =
  'https://central.github.com/api/features/desktop/desktop/short-lived-tokens'
const requestTimeout = 5_000

/**
 * Check Central's rollout before requesting new refreshable credentials.
 * Failures retain the existing sign-in flow with long-lived tokens.
 */
export async function shouldRequestShortLivedTokens(
  endpoint: string
): Promise<boolean> {
  if (!enableShortLivedTokens() || isGHES(endpoint)) {
    return false
  }

  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort()
      reject(new Error('The short-lived token rollout request timed out.'))
    }, requestTimeout)
  })

  try {
    const request = async () => {
      const url = new URL(FeatureEndpoint)
      url.searchParams.set('guid', await getRendererGUID())
      url.searchParams.set('version', getVersion())
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': getUserAgent(),
        },
        signal: controller.signal,
        redirect: 'error',
        cache: 'no-store',
        credentials: 'omit',
      })
      if (!response.ok) {
        throw new Error(
          `The short-lived token rollout request failed (${response.status}).`
        )
      }

      const value: unknown = await response.json()
      if (!isRecord(value) || typeof value.enabled !== 'boolean') {
        throw new Error('The short-lived token rollout response is invalid.')
      }

      return value.enabled
    }

    return await Promise.race([request(), deadline])
  } catch (error) {
    log.warn(
      'Unable to check short-lived token rollout; using long-lived tokens.',
      error
    )
    return false
  } finally {
    clearTimeout(timeout)
  }
}
