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

export function getProxyInfo(authInfo: AuthInfo): Promise<ProxyCredential> {
  if (authInfo.isProxy) {
    if (authInfo.realm === 'FiddlerProxy (user: 1, pass: 1)') {
      // this is the proxy credentials that fiddler expects
      return Promise.resolve({ username: '1', password: '1' })
    } else {
      // TODO: lookup in cache for credentials for the given host (and realm?)
      // HACK: where should i store this?
      const username = window.localStorage.getItem('proxy-account-name')
      if (username) {
        const service = `Proxy Server - ${authInfo.host} - ${authInfo.realm}`
        const password = keytar.getPassword(service, username)
        if (password) {
          return Promise.resolve({ username, password })
        } else {
          return new Promise((resolve, reject) => {
            // TODO: prompt user for credentials
            // TODO: handle when result received
            // TODO: handle when aborted (user cancels)
            resolve({ })
          })
        }
      }
    }
  }

  // TODO: user may bypass, which means they're gonna have a bad time

  return Promise.resolve({ })
}
