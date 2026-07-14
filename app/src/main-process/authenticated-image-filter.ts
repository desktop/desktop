import { getDotComAPIEndpoint, getHTMLURL } from '../lib/api'
import { EndpointToken } from '../lib/endpoint-token'
import { OrderedWebRequest } from './ordered-webrequest'

function isEnterpriseAvatarPath(pathname: string) {
  return pathname.startsWith('/api/v3/enterprise/avatars/')
}

function isGitHubRepoAssetPath(pathname: string) {
  // Matches paths like: /repo/owner/assets/userID/guid
  return (
    /^\/[^/]+\/[^/]+\/assets\/[^/]+\/[^/]+\/?$/.test(pathname) ||
    // or: /user-attachments/assets/guid
    /^\/user-attachments\/assets\/[^/]+\/?$/.test(pathname)
  )
}

/**
 * Installs a web request filter which adds the Authorization header for
 * unauthenticated requests to the GHES/GHAE private avatars API, and for private
 * repo assets.
 *
 * Returns a method that can be used to update the list of signed-in accounts
 * which is used to resolve which token to use.
 *
 * With multi-account support, when multiple accounts share the same endpoint
 * (e.g. multiple GitHub.com accounts), we use the first token found for that
 * origin. This is sufficient for avatar/asset loading since any valid token
 * will work for reading public or authorized content.
 */
export function installAuthenticatedImageFilter(
  orderedWebRequest: OrderedWebRequest
) {
  let originTokens = new Map<string, string>()

  orderedWebRequest.onBeforeSendHeaders.addEventListener(async details => {
    const { origin, pathname } = new URL(details.url)
    const token = originTokens.get(origin)

    if (
      token &&
      (isEnterpriseAvatarPath(pathname) || isGitHubRepoAssetPath(pathname))
    ) {
      return {
        requestHeaders: {
          ...details.requestHeaders,
          Authorization: `token ${token}`,
        },
      }
    }

    return {}
  })

  return (accounts: ReadonlyArray<EndpointToken>) => {
    // Build origin -> token map. When multiple accounts share an origin,
    // keep the first one (any valid token works for avatar/asset loading).
    originTokens = new Map<string, string>()
    for (const { endpoint, token } of accounts) {
      const origin = new URL(endpoint).origin
      if (!originTokens.has(origin)) {
        originTokens.set(origin, token)
      }
    }

    // If we have a token for api.github.com, add another entry in our
    // tokens-by-origin map with the same token for github.com. This is
    // necessary for private image URLs.
    const dotComAPIEndpoint = getDotComAPIEndpoint()
    const dotComAPIToken = originTokens.get(dotComAPIEndpoint)
    if (dotComAPIToken) {
      originTokens.set(getHTMLURL(dotComAPIEndpoint), dotComAPIToken)
    }
  }
}
