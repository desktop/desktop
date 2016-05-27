import {shell} from 'electron'

const keytar = require('keytar')

const ServiceName = 'GitHubClient'
const ServiceUserName = 'user'

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = '4b35aab1581a32e23af0d930f2a294ae3bb84960'

const DefaultHeaders: {[key: string]: string} = {
  'Accept': 'application/vnd.github.v3+json, application/json',
  'Content-Type': 'application/json',
  // TODO: We should get these from package.json at compile time.
  'User-Agent': 'GitHubClient/0.0.1'
}

let authState: string = null

export function requestToken(code: string): Promise<string> {
  // TODO: This should take a server URL.
  return fetch('https://github.com/login/oauth/access_token', {
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

function getOAuthURL(state: string): string {
  // TODO: This should take a server URL.
  return 'https://github.com/login/oauth/authorize?client_id=' + ClientID + '&scope=repo&state=' + state
}

function guid(): string {
  function s4(): string {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1)
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
}

export function authenticate() {
  authState = guid()
  shell.openExternal(getOAuthURL(authState))
}

export function getToken(): string {
  return keytar.getPassword(ServiceName, ServiceUserName)
}

export function setToken(token: string) {
  keytar.addPassword(ServiceName, ServiceUserName, token)
}
