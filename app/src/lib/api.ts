import * as URL from 'url'
import { User } from '../models/user'

const Octokat = require('octokat')

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

export interface IAPIIssue {
  readonly number: string
  readonly title: string
  readonly state: 'open' | 'closed'
}

/**
 * An object for making authenticated requests to the GitHub API
 */
export class API {
  private client: any

  public constructor(user: User) {
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
   * Fetch the open issues that have been created or updated since the given
   * date.
   */
  public async fetchIssues(owner: string, name: string, state: 'open' | 'closed' | 'all', since: Date | null): Promise<ReadonlyArray<IAPIIssue>> {
    let params = { state }
    if (since) {
      params = Object.assign({}, params, { since: since.toISOString() })
    }

    const allItems: Array<IAPIIssue> = []
    let result = await this.client.repos(owner, name).issues.fetch(params)
    allItems.push(...result.items)

    while (result.nextPage) {
      result = await result.nextPage.fetch()
      allItems.push(...result.items)
    }

    // PRs are issues :\ But we only want Real Issues.
    const issuesOnly = allItems.filter((i: any) => !i.pullRequest)
    return issuesOnly
  }
}

/**
 * Get the URL for the HTML site. For example:
 *
 * https://api.github.com -> https://github.com
 * http://github.mycompany.com/api -> http://github.mycompany.com/
 */
export function getHTMLURL(endpoint: string): string {
  if (endpoint === getDotComAPIEndpoint()) {
    // GitHub.com is A Special Snowflake in that the API lives at a subdomain
    // but the site itself lives on the parent domain.
    return 'https://github.com'
  } else {
    const parsed = URL.parse(endpoint)
    return `${parsed.protocol}//${parsed.hostname}`
  }
}

/** Get github.com's API endpoint. */
export function getDotComAPIEndpoint(): string {
  return 'https://api.github.com'
}

/** Get the user for the endpoint. */
export function getUserForEndpoint(users: ReadonlyArray<User>, endpoint: string): User {
  return users.filter(u => u.endpoint === endpoint)[0]
}
