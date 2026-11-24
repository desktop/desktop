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
 * Opt in beta and development features, or check Central's rollout.
 * Failures retain the existing sign-in flow with long-lived tokens.
 */
export async function shouldRequestShortLivedTokens(
  endpoint: string
): Promise<boolean> {
  if (isGHES(endpoint)) {
    return false
  }

  if (enableShortLivedTokens()) {
    return true
  }

  try {
    const url = new URL(FeatureEndpoint)
    url.searchParams.set('guid', await getRendererGUID())
    url.searchParams.set('version', getVersion())
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': getUserAgent(),
      },
      signal: AbortSignal.timeout(requestTimeout),
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
  } catch (error) {
    log.warn(
      'Unable to check short-lived token rollout; using long-lived tokens.',
      error
    )
    return false
  }
}
