import * as OS from 'os'
import * as URL from 'url'
import * as Querystring from 'querystring'
import { Account } from '../models/account'
import { IEmail } from '../models/email'

import { HTTPMethod, request, deserialize } from './http'
import { AuthenticationMode } from './2fa'
import { uuid } from './uuid'

import { getLogger } from '../lib/logging/renderer'

const Octokat = require('octokat')
const username: () => Promise<string> = require('username')

const ClientID = process.env.TEST_ENV ? '' : __OAUTH_CLIENT_ID__
const ClientSecret = process.env.TEST_ENV ? '' : __OAUTH_SECRET__

if (!ClientID || !ClientID.length || !ClientSecret || !ClientSecret.length) {
  console.warn(`DESKTOP_OAUTH_CLIENT_ID and/or DESKTOP_OAUTH_CLIENT_SECRET is undefined. You won't be able to authenticate new users.`)
}

/** The OAuth scopes we need. */
const Scopes = [
  'repo',
  'user',
]

/** The note URL used for authorizations the app creates. */
const NoteURL = 'https://desktop.github.com/'

/**
 * The plugins we'll use with Octokat.
 *
 * Most notably, this doesn't include:
 *   - hypermedia
 *   - camel-case
 * Both take a _lot_ of time in post-processing and are unnecessary.
 */
const OctokatPlugins = [
  require('octokat/dist/node/plugins/object-chainer'),
  require('octokat/dist/node/plugins/path-validator'),
  require('octokat/dist/node/plugins/authorization'),
  require('octokat/dist/node/plugins/preview-apis'),
  require('octokat/dist/node/plugins/use-post-instead-of-patch'),

  require('octokat/dist/node/plugins/simple-verbs'),
  require('octokat/dist/node/plugins/fetch-all'),

  require('octokat/dist/node/plugins/read-binary'),
  require('octokat/dist/node/plugins/pagination'),
]

/**
 * Information about a repository as returned by the GitHub API.
 */
export interface IAPIRepository {
  readonly clone_url: string
  readonly html_url: string
  readonly name: string
  readonly owner: IAPIUser
  readonly private: boolean
  readonly fork: boolean
  readonly default_branch: string
}

/**
 * Information about a commit as returned by the GitHub API.
 */
export interface IAPICommit {
  readonly sha: string
  readonly author: IAPIUser | null
}

/**
 * Information about a user as returned by the GitHub API.
 */
export interface IAPIUser {
  readonly id: number
  readonly url: string
  readonly type: 'user' | 'org'
  readonly login: string
  readonly avatar_url: string
  readonly name: string
}

/** The users we get from the mentionables endpoint. */
export interface IAPIMentionableUser {
  readonly avatar_url: string

  /**
   * Note that this may be an empty string *or* null in the case where the user
   * has no public email address.
   */
  readonly email: string | null

  readonly login: string

  readonly name: string
}

/**
 * Information about a user's email as returned by the GitHub API.
 */
export interface IAPIEmail {
  readonly email: string
  readonly verified: boolean
  readonly primary: boolean
  /**
   * `null` can be returned by the API for legacy reasons. A non-null value is
   * set for the primary email address currently, but in the future visibility
   * may be defined for each email address.
   */
  readonly visibility: 'public' | 'private' | null
}

function convertEmailAddress(email: IAPIEmail): IEmail {
  return {
    ...email,
    visibility: email.visibility || 'public',
  }
}

/** Information about an issue as returned by the GitHub API. */
export interface IAPIIssue {
  readonly number: number
  readonly title: string
  readonly state: 'open' | 'closed'
}

/** The metadata about a GitHub server. */
export interface IServerMetadata {
  /**
   * Does the server support password-based authentication? If not, the user
   * must go through the OAuth flow to authenticate.
   */
  readonly verifiable_password_authentication: boolean
}

/** The server response when handling the OAuth callback (with code) to obtain an access token */
interface IAPIAccessToken {
  readonly access_token: string
  readonly scope: string
  readonly token_type: string
}

/**
 * The structure of error messages returned from the GitHub API.
 *
 * Details: https://developer.github.com/v3/#client-errors
 */
interface IError {
  readonly resource: string
  readonly field: string
}

/**
 * The partial server response when an error has been returned.
 *
 * Details: https://developer.github.com/v3/#client-errors
 */
interface IAPIError {
  readonly errors: IError[]
}

/** The partial server response when creating a new authorization on behalf of a user */
interface IAPIAuthorization {
  readonly token: string
}

/** The response we receive from fetching mentionables. */
interface IAPIMentionablesResponse {
  readonly etag: string
  readonly users: ReadonlyArray<IAPIMentionableUser>
}

/**
 * An object for making authenticated requests to the GitHub API
 */
export class API {
  private client: any
  private account: Account

  public constructor(account: Account) {
    this.account = account
    this.client = new Octokat({
      token: account.token,
      rootURL: account.endpoint,
      plugins: OctokatPlugins,
    })
  }

  /**
   * Loads all repositories accessible to the current user.
   *
   * Loads public and private repositories across all organizations
   * as well as the user account.
   *
   * @returns A promise yielding an array of {APIRepository} instances or error
   */
  public async fetchRepos(): Promise<ReadonlyArray<IAPIRepository>> {
    const results: IAPIRepository[] = []
    let nextPage = this.client.user.repos
    while (nextPage) {
      const request = await nextPage.fetch()
      results.push(...request.items)
      nextPage = request.nextPage
    }

    return results
  }

  /** Fetch a repo by its owner and name. */
  public async fetchRepository(owner: string, name: string): Promise<IAPIRepository | null> {
    try {
      return await this.client.repos(owner, name).fetch()
    } catch (e) {
      getLogger().error(`fetchRepository: not found for '${this.account.login}' and '${owner}/${name}'`, e)
      return null
    }
  }

  /** Fetch the logged in account. */
  public fetchAccount(): Promise<IAPIUser> {
    return this.client.user.fetch()
  }

  /** Fetch the current user's emails. */
  public async fetchEmails(): Promise<ReadonlyArray<IEmail>> {
    const result = await this.client.user.emails.fetch()
    const emails: ReadonlyArray<IAPIEmail> = result.items
    return emails.map(convertEmailAddress)
  }

  /** Fetch a commit from the repository. */
  public async fetchCommit(owner: string, name: string, sha: string): Promise<IAPICommit | null> {
    try {
      const commit = await this.client.repos(owner, name).commits(sha).fetch()
      return commit
    } catch (e) {
      getLogger().error(`fetchCommit: not found for '${this.account.login}' and commit '${owner}/${name}@${sha}'`, e)
      return null
    }
  }

  /** Search for a user with the given public email. */
  public async searchForUserWithEmail(email: string): Promise<IAPIUser | null> {
    try {
      const result = await this.client.search.users.fetch({ q: `${email} in:email type:user` })
      // The results are sorted by score, best to worst. So the first result is
      // our best match.
      const user = result.items[0]
      return user
    } catch (e) {
      getLogger().error(`searchForUserWithEmail: not found for '${this.account.login}' and '${email}'`, e)
      return null
    }
  }

  /** Fetch all the orgs to which the user belongs. */
  public async fetchOrgs(): Promise<ReadonlyArray<IAPIUser>> {
    const result = await this.client.user.orgs.fetch()
    return result.items
  }

  /** Create a new GitHub repository with the given properties. */
  public async createRepository(org: IAPIUser | null, name: string, description: string, private_: boolean): Promise<IAPIRepository> {
    if (org) {
      return this.client.orgs(org.login).repos.create({ name, description, private: private_ })
    } else {
      return this.client.user.repos.create({ name, description, private: private_ })
    }
  }

  /**
   * Fetch the issues with the given state that have been created or updated
   * since the given date.
   */
  public async fetchIssues(owner: string, name: string, state: 'open' | 'closed' | 'all', since: Date | null): Promise<ReadonlyArray<IAPIIssue>> {
    const params: any = { state }
    if (since) {
      params.since = since.toISOString()
    }

    const allItems: Array<IAPIIssue> = []
    // Note that we only include `params` on the first fetch. Octokat.js will
    // preserve them as we fetch subsequent pages and would fail to advance
    // pages if we included the params on each call.
    let result = await this.client.repos(owner, name).issues.fetch(params)
    allItems.push(...result.items)

    while (result.nextPage) {
      result = await result.nextPage.fetch()
      allItems.push(...result.items)
    }

    // PRs are issues! But we only want Really Seriously Issues.
    return allItems.filter((i: any) => !i.pullRequest)
  }

  private authenticatedRequest(method: HTTPMethod, path: string, body?: Object, customHeaders?: Object): Promise<Response> {
    return request(this.account.endpoint, `token ${this.account.token}`, method, path, body, customHeaders)
  }

  /**
   * Get the allowed poll interval for fetching. If an error occurs it will
   * return null.
   */
  public async getFetchPollInterval(owner: string, name: string): Promise<number | null> {
    const path = `repos/${Querystring.escape(owner)}/${Querystring.escape(name)}/git`
    const response = await this.authenticatedRequest('HEAD', path)
    const interval = response.headers.get('x-poll-interval')
    if (interval) {
      const parsed = parseInt(interval, 10)
      return isNaN(parsed) ? null : parsed
    }
    return null
  }

  /** Fetch the mentionable users for the repository. */
  public async fetchMentionables(owner: string, name: string, etag: string | null): Promise<IAPIMentionablesResponse | null> {
    // NB: this custom `Accept` is required for the `mentionables` endpoint.
    const headers: any = {
      'Accept': 'application/vnd.github.jerry-maguire-preview',
    }

    if (etag) {
      headers['If-None-Match'] = etag
    }

    const response = await this.authenticatedRequest('GET', `repos/${owner}/${name}/mentionables/users`, undefined, headers)
    if (!response.ok) { return null }

    const users = await deserialize<ReadonlyArray<IAPIMentionableUser>>(response)
    if (!users) { return null }

    const responseEtag = response.headers.get('etag')
    return { users, etag: responseEtag || '' }
  }
}

export enum AuthorizationResponseKind {
  Authorized,
  Failed,
  TwoFactorAuthenticationRequired,
  UserRequiresVerification,
  PersonalAccessTokenBlocked,
  Error,
}

export type AuthorizationResponse = { kind: AuthorizationResponseKind.Authorized, token: string } |
                                    { kind: AuthorizationResponseKind.Failed, response: Response } |
                                    { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type: AuthenticationMode } |
                                    { kind: AuthorizationResponseKind.Error, response: Response } |
                                    { kind: AuthorizationResponseKind.UserRequiresVerification } |
                                    { kind: AuthorizationResponseKind.PersonalAccessTokenBlocked }

/**
 * Create an authorization with the given login, password, and one-time
 * password.
 */
export async function createAuthorization(endpoint: string, login: string, password: string, oneTimePassword: string | null): Promise<AuthorizationResponse> {
  const creds = Buffer.from(`${login}:${password}`, 'utf8').toString('base64')
  const authorization = `Basic ${creds}`
  const headers = oneTimePassword ? { 'X-GitHub-OTP': oneTimePassword } : {}

  const note = await getNote()

  const response = await request(endpoint, authorization, 'POST', 'authorizations', {
    'scopes': Scopes,
    'client_id': ClientID,
    'client_secret': ClientSecret,
    'note': note,
    'note_url': NoteURL,
    'fingerprint': uuid(),
  }, headers)

  if (response.status === 401) {
    const otpResponse = response.headers.get('x-github-otp')
    if (otpResponse) {
      const pieces = otpResponse.split(';')
      if (pieces.length === 2) {
        const type = pieces[1].trim()
        switch (type) {
          case 'app':
            return { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type: AuthenticationMode.App }
          case 'sms':
            return { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type: AuthenticationMode.Sms }
          default:
            return { kind: AuthorizationResponseKind.Failed, response }
        }
      }
    }

    return { kind: AuthorizationResponseKind.Failed, response }
  }

  if (response.status === 403) {
    const body = await response.json()
    if (body.message === 'This API can only be accessed with username and password Basic Auth') {
      // Authorization API does not support providing personal access tokens
      return { kind: AuthorizationResponseKind.PersonalAccessTokenBlocked }
    }
    return { kind: AuthorizationResponseKind.Error, response }
  }

  if (response.status === 422) {
    const apiError = await deserialize<IAPIError>(response)
    if (apiError) {
      for (const error of apiError.errors) {
        const isExpectedResource = error.resource.toLowerCase() === 'oauthaccess'
        const isExpectedField =  error.field.toLowerCase() === 'user'
        if (isExpectedField && isExpectedResource) {
          return { kind: AuthorizationResponseKind.UserRequiresVerification }
        }
      }
    }
  }

  const body = await deserialize<IAPIAuthorization>(response)
  if (body) {
    const token = body.token
    if (token && typeof token === 'string' && token.length) {
      return { kind: AuthorizationResponseKind.Authorized, token }
    }
  }

  return { kind: AuthorizationResponseKind.Error, response }
}

/** Fetch the user authenticated by the token. */
export async function fetchUser(endpoint: string, token: string): Promise<Account> {
  const octo = new Octokat({ token, rootURL: endpoint })
  const user = await octo.user.fetch()

  const response =  await octo.user.emails.fetch()
  const emails: ReadonlyArray<IAPIEmail> = response.items
  const formattedEmails = emails.map(convertEmailAddress)

  return new Account(user.login, endpoint, token, formattedEmails, user.avatarUrl, user.id, user.name)
}

/** Get metadata from the server. */
export async function fetchMetadata(endpoint: string): Promise<IServerMetadata | null> {

  const url = `${endpoint}/meta`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    if (!response.ok) { return null }

    const body = await deserialize<IServerMetadata>(response)
    if (!body || body.verifiable_password_authentication === undefined) {
      return null
    }

    return body
  } catch (e) {
    getLogger().error(`fetchMetadata: unable to load metadata from '${url}' as a fallback`, e)
    return null
  }
}

/** The note used for created authorizations. */
async function getNote(): Promise<string> {
  let localUsername = 'unknown'
  try {
    localUsername = await username()
  } catch (e) {
    getLogger().error(`getNote: unable to resolve machine username, using '${localUsername}' as a fallback`, e)
  }

  return `GitHub Desktop on ${localUsername}@${OS.hostname()}`
}

/**
 * Map a repository's URL to the endpoint associated with it. For example:
 *
 * https://github.com/desktop/desktop -> https://api.github.com
 * http://github.mycompany.com/my-team/my-project -> http://github.mycompany.com/api
 */
export function getEndpointForRepository(url: string): string {
  const parsed = URL.parse(url)
  if (parsed.hostname === 'github.com') {
    return getDotComAPIEndpoint()
  } else {
    return `${parsed.protocol}//${parsed.hostname}/api`
  }
}

/**
 * Get the URL for the HTML site. For example:
 *
 * https://api.github.com -> https://github.com
 * http://github.mycompany.com/api -> http://github.mycompany.com/
 */
export function getHTMLURL(endpoint: string): string {
  // In the case of GitHub.com, the HTML site lives on the parent domain.
  //  E.g., https://api.github.com -> https://github.com
  //
  // Whereas with Enterprise, it lives on the same domain but without the
  // API path:
  //  E.g., https://github.mycompany.com/api/v3 -> https://github.mycompany.com
  //
  // We need to normalize them.
  if (endpoint === getDotComAPIEndpoint()) {
    return 'https://github.com'
  } else {
    const parsed = URL.parse(endpoint)
    return `${parsed.protocol}//${parsed.hostname}`
  }
}

/**
 * Get the API URL for an HTML URL. For example:
 *
 * http://github.mycompany.com -> http://github.mycompany.com/api/v3
 */
export function getEnterpriseAPIURL(endpoint: string): string {
  const parsed = URL.parse(endpoint)
  return `${parsed.protocol}//${parsed.hostname}/api/v3`
}

/** Get github.com's API endpoint. */
export function getDotComAPIEndpoint(): string {
  const envEndpoint = process.env['API_ENDPOINT']
  if (envEndpoint && envEndpoint.length > 0) {
    return envEndpoint
  }

  return 'https://api.github.com'
}

/** Get the account for the endpoint. */
export function getAccountForEndpoint(accounts: ReadonlyArray<Account>, endpoint: string): Account | null {
  const filteredAccounts = accounts.filter(a => a.endpoint === endpoint)
  if (filteredAccounts.length) {
    return filteredAccounts[0]
  }
  return null
}

export function getOAuthAuthorizationURL(endpoint: string, state: string): string {
  const urlBase = getHTMLURL(endpoint)
  const scope = encodeURIComponent(Scopes.join(' '))
  return `${urlBase}/login/oauth/authorize?client_id=${ClientID}&scope=${scope}&state=${state}`
}

export async function requestOAuthToken(endpoint: string, state: string, code: string): Promise<string | null> {
  const urlBase = getHTMLURL(endpoint)
  const response = await request(urlBase, null, 'POST', 'login/oauth/access_token', {
    'client_id': ClientID,
    'client_secret': ClientSecret,
    'code': code,
    'state': state,
  })
  if (!response.ok) { return null }

  const body = await deserialize<IAPIAccessToken>(response)
  if (body) {
    return body.access_token
  }

  return null
}
