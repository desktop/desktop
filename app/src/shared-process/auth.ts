import { shell } from 'electron'

import { getDotComAPIEndpoint } from '../lib/api'
import { fatalError } from '../lib/fatal-error'
import * as appProxy from '../ui/lib/app-proxy'
import { IUser } from '../models/user'
import { v4 as guid } from 'node-uuid'

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = process.env.TEST_ENV ? '' : __OAUTH_SECRET__
if (!ClientSecret || !ClientSecret.length) {
  console.warn(`DESKTOP_OAUTH_CLIENT_SECRET is undefined. You won't be able to authenticate new users.`)
}

const Scopes = [
  'repo',
  'user',
].join(' ')

const DefaultHeaders: {[key: string]: string} = {
  'Accept': 'application/vnd.github.v3+json, application/json',
  'Content-Type': 'application/json',
  'User-Agent': `${appProxy.getName()}/${appProxy.getVersion()}`,
}

interface IAuthState {
  readonly oAuthState: string
  readonly endpoint: string
  readonly resolve: (user: IUser) => void
  readonly reject: (error: Error) => void
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
      'state': authState,
    }),
  })
  const json = await response.json()
  return json.access_token
}

/**
 * Resolve the current OAuth request with the given user.
 *
 * Note that this can only be called after `askUserToAuth` has been called and
 * must only be called once.
 */
export function resolveAuthRequest(user: IUser) {
  if (!authState) {
    return fatalError('`askUserToAuth` must be called before resolving an auth request.')
  }

  authState.resolve(user)

  authState = null
}

/**
 * Reject the current OAuth request with the given error.
 *
 * Note that this can only be called after `askUserToAuth` has been called and
 * must only be called once.
 */
export function rejectAuthRequest(error: Error) {
  if (!authState) {
    return fatalError('`askUserToAuth` must be called before rejecting an auth request.')
  }

  authState.reject(error)

  authState = null
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

/**
 * Ask the user to auth with the given endpoint. This will open their browser.
 *
 * @param endpoint - The endpoint to auth against.
 * @param resolve  - The function to call when the auth flow is done.
 * @param reject   - The function to call when an error occurs.
 */
export function askUserToAuth(endpoint: string, resolve: (user: IUser) => void, reject: (error: Error) => void) {
  authState = { oAuthState: guid(), endpoint, resolve, reject }

  shell.openExternal(getOAuthAuthorizationURL(authState))
}
