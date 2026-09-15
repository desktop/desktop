import { OrderedWebRequest } from './ordered-webrequest'

/**
 * Installs a web request filter to override the default Origin used to connect
 * to Alive web sockets
 */
export function installAliveOriginFilter(orderedWebRequest: OrderedWebRequest) {
  orderedWebRequest.onBeforeSendHeaders.addEventListener(async details => {
    const { protocol, host } = new URL(details.url)

    // Here we're only interested in WebSockets
    if (protocol !== 'wss:') {
      return {}
    }

    // Alive URLs are supposed to be prefixed by "alive" and then the hostname
    if (
      !/^alive\.github\.com$/.test(host) &&
      !/^alive\.(.*)\.ghe\.com$/.test(host)
    ) {
      return {}
    }

    // We will just replace the `alive` prefix (which indicates the service)
    // with `desktop`.
    return {
      requestHeaders: {
        ...details.requestHeaders,
        Origin: `https://${host.replace('alive.', 'desktop.')}`,
      },
    }
  })
}
