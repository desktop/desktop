import {shell, remote} from 'electron'
const {app} = remote

import guid from './lib/guid'
import User from './user'

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = '4b35aab1581a32e23af0d930f2a294ae3bb84960'

const DefaultHeaders: {[key: string]: string} = {
  'Accept': 'application/vnd.github.v3+json, application/json',
  'Content-Type': 'application/json',
  'User-Agent': `${app.getName()}/${app.getVersion()}`
}

interface AuthState {
  oAuthState: string
  endpoint: string
}
let authState: AuthState = null

export async function requestToken(code: string): Promise<string> {
  const urlBase = getOAuthURL(authState.endpoint)
  const response = await fetch(`${urlBase}/login/oauth/access_token`, {
    method: 'post',
    headers: DefaultHeaders,
    body: JSON.stringify({
      'client_id': ClientID,
      'client_secret': ClientSecret,
      'code': code,
      'state': authState
    })
  })
  const json = await response.json()
  return json.access_token
}

function getOAuthAuthorizationURL(authState: AuthState): string {
  const urlBase = getOAuthURL(authState.endpoint)
  return `${urlBase}/login/oauth/authorize?client_id=${ClientID}&scope=repo&state=${authState.oAuthState}`
}

function getOAuthURL(endpoint: string): string {
  if (endpoint === getDotComEndpoint()) {
    // GitHub.com is A Special Snowflake in that the API lives at a subdomain
    // but OAuth lives on the parent domain.
    return 'https://github.com'
  } else {
    return endpoint
  }
}

export function getDotComEndpoint(): string {
  return 'https://api.github.com'
}

export function askUserToAuth(endpoint: string) {
  authState = {oAuthState: guid(), endpoint}

  shell.openExternal(getOAuthAuthorizationURL(authState))
}

export function getKeyForUser(user: User): string {
  return `GitHub – ${user.getEndpoint()}`
}
