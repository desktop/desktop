import {shell} from 'electron'

import * as keytar from 'keytar'

const ServiceName = 'GitHubClient'

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

export function requestToken(code: string): Promise<string> {
  return fetch(`${authState.endpoint}/login/oauth/access_token`, {
      method: 'post',
      headers: DefaultHeaders,
      body: JSON.stringify({
        'client_id': ClientID,
        'client_secret': ClientSecret,
        'code': code,
        'state': authState
      })
    })
    .then(response => response.json())
    .then(response => response.access_token)
}

function getOAuthURL(endpoint: string, state: string): string {
  return `${endpoint}/login/oauth/authorize?client_id=${ClientID}&scope=repo&state=${state}`
}

function guid(): string {
  function s4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

export function getDotComEndpoint(): string {
  return 'https://github.com'
}

export function askUserToAuth(endpoint: string) {
  authState = {oAuthState: guid(), endpoint}

  shell.openExternal(getOAuthURL(endpoint, authState.oAuthState))
}

export function getToken(username: string): string {
  return keytar.getPassword(ServiceName, username)
}

export function setToken(username: string, token: string) {
  keytar.addPassword(ServiceName, username, token)
}
