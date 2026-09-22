import { getDotComAPIEndpoint, getHTMLURL } from '../lib/api'
import { EndpointToken } from '../lib/endpoint-token'
import { OrderedWebRequest } from './ordered-webrequest'

interface IImageAccount {
  readonly endpoint: string
  readonly token: string
  readonly session: symbol
}

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
export function installAuthenticatedImageFilter(
  orderedWebRequest: OrderedWebRequest,
  resolveToken: (endpoint: string, token: string) => Promise<string>
) {
  let originTokens = new Map<string, IImageAccount>()

  orderedWebRequest.onBeforeSendHeaders.addEventListener(async details => {
    const { origin, pathname } = new URL(details.url)
    const account = originTokens.get(origin)

    if (
      account?.token &&
      (isEnterpriseAvatarPath(pathname) || isGitHubRepoAssetPath(pathname))
    ) {
      try {
        const token = await resolveToken(account.endpoint, account.token)
        const current = originTokens.get(origin)
        if (
          !token ||
          current?.session !== account.session ||
          (current.token !== account.token && current.token !== token)
        ) {
          return { cancel: true }
        }

        return {
          requestHeaders: {
            ...details.requestHeaders,
            Authorization: `token ${token}`,
          },
        }
      } catch {
        return { cancel: true }
      }
    }

    return {}
  })

  return (accounts: ReadonlyArray<EndpointToken>) => {
    originTokens = new Map(
      accounts.map(({ endpoint, token }) => {
        const origin = new URL(endpoint).origin
        const previous = originTokens.get(origin)
        // Keep the session across token rotation, but never across signout.
        const session =
          previous?.endpoint === endpoint ? previous.session : Symbol()
        return [origin, { endpoint, token, session }]
      })
    )

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
