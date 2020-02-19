import { remote } from 'electron'
import { enableAutomaticGitProxyConfiguration } from './feature-flag'
import { parsePACString } from './parse-pac-string'

export class ProxyResolver {
  public async resolve(url: string): Promise<string | undefined> {
    if (!enableAutomaticGitProxyConfiguration()) {
      return undefined
    }

    // resolveProxy doesn't throw an error (at least not in the
    // current Electron version) but it could in the future and
    // it's also possible that the IPC layer could throw an
    // error (if the URL we're given is null or undefined desptite
    // our best type efforts for example).
    // Better safe than sorry.
    const pacString = await remote.session.defaultSession
      .resolveProxy(url)
      .catch(err => {
        log.error(`Failed resolving proxy for '${url}'`, err)
        return 'DIRECT'
      })

    const proxies = parsePACString(pacString)

    if (proxies === null) {
      return undefined
    }

    // GitHub Desktop relies on the schannel `http.sslBackend` to be used
    // in order to support things like self-signed certificates. Unfortunately
    // it doesn't support https proxies so we'll exclude those here. Luckily
    // for us https proxies are really rare.
    //
    // See
    // https://github.com/jeroen/curl/issues/186#issuecomment-494560890
    // "The Schannel backend doesn't support HTTPS proxy"
    return proxies.find(x => !x.startsWith('https://'))
  }
}
