import { WebRequest } from 'electron/main'

export function installSameOriginFilter(webRequest: WebRequest) {
  const requestOrigin = new Map<number, string>()
  const safeProtocols = new Set(['devtools:', 'file:', 'chrome-extension:'])
  const unsafeHeaders = new Set(['authentication', 'authorization', 'cookie'])

  webRequest.onBeforeRequest((details, cb) => {
    const { protocol, origin } = new URL(details.url)

    // This is called once for the initial request and then once for each
    // "subrequest" thereafter, i.e. a request to https://foo/bar which gets
    // redirected to https://foo/baz will trigger this twice and we only
    // care about capturing the initial request origin
    if (!safeProtocols.has(protocol) && !requestOrigin.has(details.id)) {
      requestOrigin.set(details.id, origin)
    }

    cb({})
  })

  webRequest.onBeforeSendHeaders((details, cb) => {
    const initialOrigin = requestOrigin.get(details.id)

    if (initialOrigin === undefined) {
      return cb({ requestHeaders: details.requestHeaders })
    }

    const { origin } = new URL(details.url)

    if (initialOrigin === origin) {
      return cb({ requestHeaders: details.requestHeaders })
    }

    // From here on we consider this request unsafe, there's no point in
    // restoring unsafe headers should the request end up being redirected
    // back to the origin again so we can just drop it from the dictionary
    requestOrigin.delete(details.id)

    const sanitizedHeaders: Record<string, string> = {}

    for (const [k, v] of Object.entries(details.requestHeaders)) {
      if (!unsafeHeaders.has(k.toLowerCase())) {
        sanitizedHeaders[k] = v
      }
    }

    log.debug(`Sanitizing cross-origin redirect to ${origin}`)
    return cb({ requestHeaders: sanitizedHeaders })
  })

  webRequest.onCompleted(details => requestOrigin.delete(details.id))
}
