import * as URL from 'url'
import User from '../models/user'

const Octokat = require('octokat')

/**
 * Information about a repository as returned by the GitHub API.
 */
export interface APIRepository {
  readonly cloneUrl: string,
  readonly htmlUrl: string,
  readonly name: string
  readonly owner: {
    avatarUrl: string,
    login: string
    type: 'user' | 'org'
  },
  readonly private: boolean,
  readonly fork: boolean,
  readonly stargazersCount: number
}

/**
 * An object for making authenticated requests to the GitHub API
 */
export default class API {
  private client: any

  public constructor(user: User) {
    this.client = new Octokat({token: user.token, rootURL: user.endpoint})
  }

  /**
   * Loads all repositories accessible to the current user.
   *
   * Loads public and private repositories across all organizations
   * as well as the user account.
   *
   * @returns A promise yielding an array of {APIRepository} instances or error
   */
  public async fetchRepos(): Promise<APIRepository[]> {
    const results: APIRepository[] = []
    let nextPage = this.client.user.repos
    while (nextPage) {
      const request = await nextPage.fetch()
      results.push(...request.items)
      nextPage = request.nextPage
    }

    return results
  }

  /** Fetch a repo by its owner and name. */
  public fetchRepository(owner: string, name: string): Promise<APIRepository> {
    return this.client.repos(owner, name).fetch()
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
