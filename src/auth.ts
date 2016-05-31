import {shell} from 'electron'
import * as keytar from 'keytar'

import guid from './lib/guid'
import User from './user'

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = '4b35aab1581a32e23af0d930f2a294ae3bb84960'

const DefaultHeaders: {[key: string]: string} = {
  'Accept': 'application/vnd.github.v3+json, application/json',
  'Content-Type': 'application/json',
  // TODO: We should get these from package.json at compile time.
  'User-Agent': 'GitHubClient/0.0.1'
}

interface AuthState {
  oAuthState: string
  endpoint: string
}
let authState: AuthState = null

export async function requestToken(code: string): Promise<string> {
  const response = await fetch(`${authState.endpoint}/login/oauth/access_token`, {
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

function getOAuthURL(authState: AuthState): string {
  return `${authState.endpoint}/login/oauth/authorize?client_id=${ClientID}&scope=repo&state=${authState.oAuthState}`
}

export function getDotComEndpoint(): string {
  return 'https://github.com'
}

export function askUserToAuth(endpoint: string) {
  authState = {oAuthState: guid(), endpoint}

  shell.openExternal(getOAuthURL(authState))
}

export function getToken(login: string, endpoint: string): string {
  const serviceName = getServiceNameForUser(new User(login, endpoint, ''))
  return keytar.getPassword(serviceName, login)
}

export function setToken(user: User, token: string) {
  const serviceName = getServiceNameForUser(user)
  keytar.addPassword(serviceName, user.getLogin(), token)
}

function getServiceNameForUser(user: User): string {
  return `GitHub – ${user.getEndpoint()}`
}
