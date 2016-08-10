import { shell, remote } from 'electron'
const { app } = remote

import guid from '../lib/guid'
import User from '../models/user'
import { getDotComAPIEndpoint } from '../lib/api'
import fatalError from '../lib/fatal-error'

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = '4b35aab1581a32e23af0d930f2a294ae3bb84960'

const Scopes = [
  'repo',
  'user',
].join(' ')

const DefaultHeaders: {[key: string]: string} = {
  'Accept': 'application/vnd.github.v3+json, application/json',
  'Content-Type': 'application/json',
  'User-Agent': `${app.getName()}/${app.getVersion()}`
}

interface IAuthState {
  readonly oAuthState: string
  readonly endpoint: string
}
let authState: IAuthState | null = null

export async function requestToken(code: string): Promise<string> {
  if (!authState) {
    return fatalError('`askUserToAuth` must be called before requesting a token.')
  }

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

function getOAuthAuthorizationURL(authState: IAuthState): string {
  const urlBase = getOAuthURL(authState.endpoint)
  return `${urlBase}/login/oauth/authorize?client_id=${ClientID}&scope=${Scopes}&state=${authState.oAuthState}`
}

function getOAuthURL(endpoint: string): string {
  if (endpoint === getDotComAPIEndpoint()) {
    // GitHub.com is A Special Snowflake in that the API lives at a subdomain
    // but OAuth lives on the parent domain.
    return 'https://github.com'
  } else {
    return endpoint
  }
}

export function askUserToAuth(endpoint: string) {
  authState = { oAuthState: guid(), endpoint }

  shell.openExternal(getOAuthAuthorizationURL(authState))
}

export function getKeyForUser(user: User): string {
  return `GitHub - ${user.endpoint}`
}
