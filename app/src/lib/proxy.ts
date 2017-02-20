import * as keytar from 'keytar'

export type AuthInfo = {
 isProxy: boolean,
 scheme: string,
 host: string,
 port: number,
 realm: string,
}

export type ProxyCredential = {
  username?: string,
  password?: string,
}

export function getProxyInfo(authInfo: AuthInfo): ProxyCredential {
  // TODO: lookup in cache for credentials for the given host (and realm?)
  // TODO: if no cached credentials found, prompt user for credentials
  // TODO: user may bypass, which means they're gonna have a bad time

  if (authInfo.isProxy) {
    if (authInfo.realm === 'FiddlerProxy (user: 1, pass: 1)') {
      // this is the proxy credentials that fiddler expects
      return { username: '1', password: '1' }
    } else {
      // TODO: lookup in cache for credentials for the given host (and realm?)
      // HACK: where should i store this?
      const username = window.localStorage.getItem('proxy-account-name')
      if (username) {
        const service = `Proxy Server - ${authInfo.host} - ${authInfo.realm}`
        const password = keytar.getPassword(service, username)
        if (password) {
          return { username, password }
        } else {
          // TODO: prompt user for credentials
        }
      } else {

      }
    }
  }

  // TODO: user may bypass, which means they're gonna have a bad time

  return { }
}
