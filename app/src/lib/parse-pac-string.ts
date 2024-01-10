/**
 * Parse a Proxy Auto Configuration (PAC) string into one or more cURL-
 * compatible proxy URLs.
 *
 * See https://developer.mozilla.org/en-US/docs/Web/HTTP/Proxy_servers_and_tunneling/Proxy_Auto-Configuration_(PAC)_file
 * for a good primer on PAC files.
 *
 * Note that this method is not intended to be a fully compliant PAC parser
 * nor is it intended to handle common PAC string mistakes (such as including
 * the protocol in the host portion of the spec). It's specifically designed
 * to translate PAC strings returned from Electron's resolveProxy method which
 * in turn relies on Chromium's `ProxyList::ToPacString()` implementation.
 *
 * Proxy protocols not supported by cURL (QUIC) will be silently omitted.
 *
 * The format of a PAC string is included below for reference but we're in a
 * special situation since what we get from Electron isn't the raw output from
 * the PAC script but rather a PAC-formatted version of Chromiums internal proxy
 * state. As such we can take several shortcuts not available to generic PAC
 * parsers.
 *
 * See the following links for a high-level step-through of the logic involved
 * in getting the PAC string from Electron/Chromium
 *
 * https://github.com/electron/electron/blob/d9321f4df751/shell/browser/net/resolve_proxy_helper.cc#L77
 * https://github.com/chromium/chromium/blob/98b0e0a61e78/net/proxy_resolution/proxy_list.cc#L134-L143
 * https://github.com/chromium/chromium/blob/2ca8c5037021/net/base/proxy_server.cc#L164-L184
 *
 * PAC string BNF
 * --------------
 *
 * From https://dxr.mozilla.org/mozilla-central/source/netwerk/base/ProxyAutoConfig.h#48
 *
 *  result      = proxy-spec *( proxy-sep proxy-spec )
 *  proxy-spec  = direct-type | proxy-type LWS proxy-host [":" proxy-port]
 *  direct-type = "DIRECT"
 *  proxy-type  = "PROXY" | "HTTP" | "HTTPS" | "SOCKS" | "SOCKS4" | "SOCKS5"
 *  proxy-sep   = ";" LWS
 *  proxy-host  = hostname | ipv4-address-literal
 *  proxy-port  = <any 16-bit unsigned integer>
 *  LWS         = *( SP | HT )
 *  SP          = <US-ASCII SP, space (32)>
 *  HT          = <US-ASCII HT, horizontal-tab (9)>
 *
 * NOTE: direct-type and proxy-type are case insensitive
 * NOTE: SOCKS implies SOCKS4
 *
 * Examples:
 *   "PROXY proxy1.foo.com:8080; PROXY proxy2.foo.com:8080; DIRECT"
 *   "SOCKS socksproxy"
 *   "DIRECT"
 *
 * Other notes:
 *
 * From https://curl.haxx.se/libcurl/c/CURLOPT_PROXY.html
 *    When you set a host name to use, do not assume that there's
 *    any particular single port number used widely for proxies.
 *    Specify it!
 */
export function parsePACString(pacString: string): Array<string> | null {
  // Happy path, this will be the case for the vast majority of users
  if (pacString === 'DIRECT') {
    return null
  }

  const specs = pacString.trim().split(/\s*;\s*/)
  const urls = new Array<string>()

  for (const spec of specs) {
    // No point in continuing after we get a DIRECT since we
    // have no way of implementing a fallback logic in cURL/Git
    if (spec.match(/^direct/i)) {
      break
    }

    const [protocol, endpoint] = spec.split(/\s+/, 2)

    if (endpoint !== undefined) {
      const url = urlFromProtocolAndEndpoint(protocol, endpoint)

      if (url !== null) {
        urls.push(url)
      } else {
        log.warn(`Skipping proxy spec: ${spec}`)
      }
    }
  }

  return urls.length > 0 ? urls : null
}

function urlFromProtocolAndEndpoint(protocol: string, endpoint: string) {
  // Note that we explicitly want to preserve the port number (if provided).
  // If we run these through url.parse or the URL constructor they will
  // both attempt to be smart and remove the default port. So if a PAC
  // string specified `PROXY myproxy:80` we'll generate `http://myproxy:80`
  // which will get turned into `http://myproxy` by URL libraries since
  // they think 80 is redundant. In our case it's not redundant though
  // because cURL defaults to port 1080 for all proxy protocols, see
  //
  // https://curl.haxx.se/libcurl/c/CURLOPT_PROXY.html
  //
  // HTTP is an alias for PROXY (or vice versa idk). I don't believe
  // we'll ever see an 'HTTP' protocol from Chromium based on my reading of
  // https://github.com/chromium/chromium/blob/2ca8c5037021/net/base/proxy_server.cc#L164-L184
  // but we'll support it nonetheless.
  //
  // SOCKS is an alias for SOCKS4
  switch (protocol.toLowerCase()) {
    case 'proxy':
    case 'http':
      return `http://${endpoint}`
    case 'https':
      return `https://${endpoint}`
    case 'socks':
    case 'socks4':
      return `socks4://${endpoint}`
    case 'socks5':
      return `socks5://${endpoint}`
  }

  return null
}
