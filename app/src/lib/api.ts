import * as OS from 'os'
import * as URL from 'url'
import * as Querystring from 'querystring'
import * as HTTP from 'http'
import { v4 as guid } from 'node-uuid'
import { User } from '../models/user'
import * as appProxy from '../ui/lib/app-proxy'

const Octokat = require('octokat')
const got = require('got')
const username: () => Promise<string> = require('username')
const camelCase: (str: string) => string = require('to-camel-case')

/** The response from `got` requests. */
interface IHTTPResponse extends HTTP.IncomingMessage {
  readonly body: any
  readonly error?: Error
}

/** The HTTP methods available. */
type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'HEAD'

const ClientID = 'de0e3c7e9973e1c4dd77'
const ClientSecret = process.env.TEST_ENV ? '' : __OAUTH_SECRET__
if (!ClientSecret || !ClientSecret.length) {
  console.warn(`DESKTOP_OAUTH_CLIENT_SECRET is undefined. You won't be able to authenticate new users.`)
}

/** The OAuth scopes we need. */
const Scopes = [
  'repo',
  'user',
]

/** The note URL used for authorizations the app creates. */
const NoteURL = 'https://desktop.github.com/'

/**
 * Information about a repository as returned by the GitHub API.
 */
export interface IAPIRepository {
  readonly cloneUrl: string
  readonly htmlUrl: string
  readonly name: string
  readonly owner: IAPIUser
  readonly private: boolean
  readonly fork: boolean
  readonly stargazersCount: number
  readonly defaultBranch: string
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
  readonly avatarUrl: string
}

/**
 * Information about a user's email as returned by the GitHub API.
 */
export interface IAPIEmail {
  readonly email: string
  readonly verified: boolean
  readonly primary: boolean
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
  readonly verifiablePasswordAuthentication: boolean
}

/**
 * An object for making authenticated requests to the GitHub API
 */
export class API {
  private client: any
  private user: User

  public constructor(user: User) {
    this.user = user
    this.client = new Octokat({ token: user.token, rootURL: user.endpoint })
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
  public fetchRepository(owner: string, name: string): Promise<IAPIRepository> {
    return this.client.repos(owner, name).fetch()
  }

  /** Fetch the logged in user. */
  public fetchUser(): Promise<IAPIUser> {
    return this.client.user.fetch()
  }

  /** Fetch the user's emails. */
  public async fetchEmails(): Promise<ReadonlyArray<IAPIEmail>> {
    const result = await this.client.user.emails.fetch()
    return result.items
  }

  /** Fetch a commit from the repository. */
  public async fetchCommit(owner: string, name: string, sha: string): Promise<IAPICommit | null> {
    try {
      const commit = await this.client.repos(owner, name).commits(sha).fetch()
      return commit
    } catch (e) {
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

  private authenticatedRequest(method: HTTPMethod, path: string, body: Object | null): Promise<IHTTPResponse> {
    return request(this.user.endpoint, `token ${this.user.token}`, method, path, body)
  }

  /** Get the allowed poll interval for fetching. */
  public async getFetchPollInterval(owner: string, name: string): Promise<number> {
    const path = `repos/${Querystring.escape(owner)}/${Querystring.escape(name)}/git`
    const response = await this.authenticatedRequest('HEAD', path, null)
    return response.headers['x-poll-interval'] || 0
  }
}

export enum AuthorizationResponseKind {
  Authorized,
  Failed,
  TwoFactorAuthenticationRequired,
  Error,
}

export type AuthorizationResponse = { kind: AuthorizationResponseKind.Authorized, token: string } |
                                    { kind: AuthorizationResponseKind.Failed, response: IHTTPResponse } |
                                    { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type: string } |
                                    { kind: AuthorizationResponseKind.Error, response: IHTTPResponse }

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
    'fingerprint': guid(),
  }, headers)

  if (response.statusCode === 401) {
    const otpResponse: string | null = response.headers['x-github-otp']
    if (otpResponse) {
      const pieces = otpResponse.split(';')
      if (pieces.length === 2) {
        const type = pieces[1].trim()
        return { kind: AuthorizationResponseKind.TwoFactorAuthenticationRequired, type }
      }
    }

    return { kind: AuthorizationResponseKind.Failed, response }
  }

  const body = response.body
  const token = body.token
  if (token && token.length) {
    return { kind: AuthorizationResponseKind.Authorized, token }
  }

  return { kind: AuthorizationResponseKind.Error, response }
}

/** Fetch the user authenticated by the token. */
export async function fetchUser(endpoint: string, token: string): Promise<User> {
  const octo = new Octokat({ token, rootURL: endpoint })
  const user = await octo.user.fetch()
  return new User(user.login, endpoint, token, new Array<string>(), user.avatarUrl, user.id)
}

/** Get metadata from the server. */
export async function fetchMetadata(endpoint: string): Promise<IServerMetadata | null> {
  const response = await request(endpoint, null, 'GET', 'meta', null)
  if (response.statusCode === 200) {
    return toCamelCase(response.body)
  } else {
    return null
  }
}

/**
 * Make an API request.
 *
 * @param endpoint      - The API endpoint.
 * @param authorization - The value to pass in the `Authorization` header.
 * @param method        - The HTTP method.
 * @param path          - The path without a leading /.
 * @param body          - The body to send.
 * @param customHeaders - Any optional additional headers to send.
 */
function request(endpoint: string, authorization: string | null, method: HTTPMethod, path: string, body: Object | null, customHeaders?: Object): Promise<IHTTPResponse> {
  const url = `${endpoint}/${path}`
  const headers: any = Object.assign({}, {
    'Accept': 'application/vnd.github.v3+json, application/json',
    'Content-Type': 'application/json',
    'User-Agent': `${appProxy.getName()}/${appProxy.getVersion()}`,
  }, customHeaders)
  if (authorization) {
    headers['Authorization'] = authorization
  }

  const options: any = {
    headers,
    method,
    json: true,
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  return got(url, options).catch((e: any) => {
    const response = e.response
    if (response) {
      response.error = e
      return response
    } else {
      throw e
    }
  })
}

/** The note used for created authorizations. */
async function getNote(): Promise<string> {
  let localUsername = 'unknown'
  try {
    localUsername = await username()
  } catch (e) {
    console.log(`Error getting username:`)
    console.error(e)
    console.log(`We'll just use 'unknown'.`)
  }

  return `GitHub Desktop on ${localUsername}@${OS.hostname()}`
}

/** Turn keys into camel case. */
export function toCamelCase(body: any): any {
  const result: any = {}
  for (const key in body) {
    const value = body[key]
    result[camelCase(key)] = value
  }

  return result
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
  return 'https://api.github.com'
}

/** Get the user for the endpoint. */
export function getUserForEndpoint(users: ReadonlyArray<User>, endpoint: string): User {
  return users.filter(u => u.endpoint === endpoint)[0]
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

  return response.body.access_token
}
