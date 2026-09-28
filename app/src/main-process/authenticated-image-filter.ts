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
 */
export function installAuthenticatedImageFilter(orderedWebRequest: {
  readonly onBeforeSendHeaders: Pick<
    OrderedWebRequest['onBeforeSendHeaders'],
    'addEventListener'
  >
}) {
  let originTokens = new Map<string, string>()
  let repositoryTokens = new Map<string, string>()

  orderedWebRequest.onBeforeSendHeaders.addEventListener(async details => {
    const { origin, pathname } = new URL(details.url)
    const repositoryPath = pathname
      .split('/')
      .slice(0, 3)
      .join('/')
      .toLowerCase()
    const token =
      repositoryTokens.get(`${origin}${repositoryPath}`) ??
      originTokens.get(origin)

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
    originTokens = new Map()
    repositoryTokens = new Map()
    for (const { endpoint, token, repositoryURL } of accounts) {
      if (repositoryURL !== undefined) {
        const url = new URL(repositoryURL)
        repositoryTokens.set(
          `${url.origin}${url.pathname.toLowerCase()}`,
          token
        )
      } else {
        const origin = new URL(endpoint).origin
        // The first account is the host default, or the active repository's account.
        if (!originTokens.has(origin)) {
          originTokens.set(origin, token)
        }
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
