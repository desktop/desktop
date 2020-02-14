import { Url } from 'url'

/**
 * Parse a Proxy Auto Configuration (PAC) string into one or more cURL-
 * compatible proxy URLs.
 *
 * Note that this method is not intended to be a fully compliant PAC parser
 * nor is it indended to handle common PAC string mistakes (such as including
 * the protocol in the host portion of the spec). It's specifically designed
 * to translate PAC strings returned from Electron's resolveProxy method which
 * in turn relies on Chromium's `ProxyList::ToPacString()` implementatiton.
 *
 * Proxy protocols not supported by cURL (QUIC) will be silently omitted.
 *
 * The format of a PAC string is included below for reference but we're in a
 * special situation since what we get from Electron isn't the raw output from
 * the PAC script but rather a PAC-formatted version of Chromiums internal proxy
 * state. As such we can take several shortcuts not available to generic PAC
 * parsers.
 *
 * See the following links for a high-level step-through of the logic involed
 * in getting
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
 */
export function parsePACString(pacString: string): Array<Url> | null {
  return null
}
