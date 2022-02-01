import { OrderedWebRequest } from './ordered-webrequest'

/**
 * Installs a web request filter to override the default Origin used to connect
 * to Alive web sockets
 */
export function installAliveOriginFilter(orderedWebRequest: OrderedWebRequest) {
  orderedWebRequest.onBeforeSendHeaders.addEventListener(async details => {
    const { protocol, host } = new URL(details.url)

    // If it's a WebSocket Secure request directed to a github.com subdomain,
    // probably related to the Alive server, we need to override the `Origin`
    // header with a valid value.
    if (protocol === 'wss:' && /(^|\.)github\.com$/.test(host)) {
      return {
        requestHeaders: {
          ...details.requestHeaders,
          // TODO: discuss with Alive team a good Origin value to use here
          Origin: 'https://desktop.github.com',
        },
      }
    }

    return {}
  })
}
