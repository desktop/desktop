import { OrderedWebRequest } from './ordered-webrequest'

/**
 * Installs a web request filter to prevent cross domain leaks of auth headers
 *
 * GitHub Desktop uses the fetch[1] web API for all of our API requests. When fetch
 * is used in a browser and it encounters an http redirect to another origin
 * domain CORS policies will apply to prevent submission of credentials[2].
 *
 * In our case however there's no concept of same-origin (and even if there were
 * it'd be problematic because we'd be making cross-origin request constantly to
 * GitHub.com and GHE instances) so the `credentials: same-origin` setting won't
 * help us.
 *
 * This is normally not a problem until http redirects get involved. When making
 * an authenticated request to an API endpoint which in turn issues a redirect
 * to another domain fetch will happily pass along our token to the second
 * domain and there's no way for us to prevent that from happening[3] using
 * the vanilla fetch API.
 *
 * That's the reason why this filter exists. It will look at all initiated
 * requests and store their origin along with their request ID. The request id
 * will be the same for any subsequent redirect requests but the urls will be
 * changing. Upon each request we will check to see if we've seen the request
 * id before and if so if the origin matches. If the origin doesn't match we'll
 * strip some potentially dangerous headers from the redirect request.
 *
 * 1. https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API
 * 2. https://fetch.spec.whatwg.org/#http-network-or-cache-fetch
 * 3. https://github.com/whatwg/fetch/issues/763
 *
 * @param orderedWebRequest
 */
export function installSameOriginFilter(orderedWebRequest: OrderedWebRequest) {
  // A map between the request ID and the _initial_ request origin
  const requestOrigin = new Map<number, string>()
  const safeProtocols = new Set(['devtools:', 'file:', 'chrome-extension:'])
  const unsafeHeaders = new Set(['authentication', 'authorization', 'cookie'])

  orderedWebRequest.onBeforeRequest.addEventListener(async details => {
    const { protocol, origin } = new URL(details.url)

    // This is called once for the initial request and then once for each
    // "subrequest" thereafter, i.e. a request to https://foo/bar which gets
    // redirected to https://foo/baz will trigger this twice and we only
    // care about capturing the initial request origin
    if (!safeProtocols.has(protocol) && !requestOrigin.has(details.id)) {
      requestOrigin.set(details.id, origin)
    }

    return {}
  })

  orderedWebRequest.onBeforeSendHeaders.addEventListener(async details => {
    const initialOrigin = requestOrigin.get(details.id)
    const { origin } = new URL(details.url)

    if (initialOrigin === undefined || initialOrigin === origin) {
      return { requestHeaders: details.requestHeaders }
    }

    const sanitizedHeaders: Record<string, string> = {}

    for (const [k, v] of Object.entries(details.requestHeaders)) {
      if (!unsafeHeaders.has(k.toLowerCase())) {
        sanitizedHeaders[k] = v
      }
    }

    log.debug(`Sanitizing cross-origin redirect to ${origin}`)
    return { requestHeaders: sanitizedHeaders }
  })

  orderedWebRequest.onCompleted.addEventListener(details =>
    requestOrigin.delete(details.id)
  )
}
