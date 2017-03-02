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

export function getProxyInfo(authInfo: AuthInfo): ProxyCredential | null {
  if (!authInfo.isProxy) {
    return null
  }

  // TODO: lookup in cache for credentials for the given host (and realm?)
  // TODO: where should i store this?
  const username = window.localStorage.getItem('proxy-account-name')
  if (username) {
    const service = `Proxy Server - ${authInfo.host} - ${authInfo.realm}`
    const password = keytar.getPassword(service, username)
    if (password) {
      return { username, password }
    }
  }

  return null
}
