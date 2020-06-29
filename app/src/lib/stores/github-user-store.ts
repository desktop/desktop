import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import {
  API,
  getAccountForEndpoint,
  getDotComAPIEndpoint,
  IAPIIdentity,
} from '../api'
import {
  GitHubUserDatabase,
  IGitHubUser,
  IMentionableUser,
} from '../databases/github-user-database'

import { fatalError } from '../fatal-error'
import { compare } from '../compare'
import { BaseStore } from './base-store'
import { getStealthEmailForUser, getLegacyStealthEmailForUser } from '../email'

function isValidAuthor(
  author: IAPIIdentity | {} | null
): author is IAPIIdentity {
  return (
    author !== null &&
    typeof author === 'object' &&
    'avatar_url' in author &&
    'login' in author
  )
}

/**
 * The store for GitHub users. This is used to match commit authors to GitHub
 * users and avatars.
 */
export class GitHubUserStore extends BaseStore {
  private readonly requestsInFlight = new Set<string>()

  /** The outer map is keyed by the endpoint, the inner map is keyed by email. */
  private readonly usersByEndpoint = new Map<string, Map<string, IGitHubUser>>()

  private readonly database: GitHubUserDatabase

  /** The requests which have failed. We shouldn't keep trying them. */
  private readonly failedRequests = new Set<string>()

  /**
   * The etag for the last mentionables request. Keyed by the GitHub repository
   * `dbID`.
   */
  private readonly mentionablesEtags = new Map<number, string>()

  public constructor(database: GitHubUserDatabase) {
    super()

    this.database = database
  }

  private getUsersForEndpoint(
    endpoint: string
  ): Map<string, IGitHubUser> | null {
    return this.usersByEndpoint.get(endpoint) || null
  }

  /**
   * Retrieve a public user profile based on the user login.
   *
   * If the user is already cached no additional API requests
   * will be made. If the user isn't in the cache but found in
   * the API it will be persisted to the database and the
   * intermediate cache.
   *
   * @param account The account to use when querying the API
   *                for information about the user
   * @param login   The login (i.e. handle) of the user
   */
  public async getByLogin(
    account: Account,
    login: string
  ): Promise<IMentionableUser | null> {
    const api = API.fromAccount(account)
    const apiUser = await api.fetchUser(login).catch(e => null)

    if (!apiUser || apiUser.type !== 'User') {
      return null
    }

    const email =
      apiUser.email !== null && apiUser.email.length > 0
        ? apiUser.email
        : getStealthEmailForUser(apiUser.id, login, account.endpoint)

    return {
      avatarURL: apiUser.avatar_url,
      email,
      name: apiUser.name || apiUser.login,
      login: apiUser.login,
    }
  }

  /** Update the mentionable users for the repository. */
  public async updateMentionables(
    repository: GitHubRepository,
    account: Account
  ): Promise<void> {
    const api = API.fromAccount(account)

    const repositoryID = repository.dbID
    if (!repositoryID) {
      return fatalError(
        `Cannot update mentionables for a repository that hasn't been cached yet.`
      )
    }
    const etag = this.mentionablesEtags.get(repositoryID) || null

    const response = await api.fetchMentionables(
      repository.owner.login,
      repository.name,
      etag
    )
    if (response === null || !Array.isArray(response.users)) {
      return
    }

    if (response.etag) {
      this.mentionablesEtags.set(repositoryID, response.etag)
    }

    const mentionables: ReadonlyArray<IMentionableUser> = response.users.map(
      user => {
        const email =
          user.email !== null && user.email.length > 0
            ? user.email
            : getLegacyStealthEmailForUser(user.login, account.endpoint)

        const { name, login, avatar_url: avatarURL } = user
        return { name, login, email, avatarURL }
      }
    )

    this.database.updateMentionablesForRepository(repositoryID, mentionables)
  }

  /** Not to be called externally. See `Dispatcher`. */
  public async _loadAndCacheUser(
    accounts: ReadonlyArray<Account>,
    repository: Repository,
    sha: string,
    email: string
  ) {
    const endpoint = repository.gitHubRepository
      ? repository.gitHubRepository.endpoint
      : getDotComAPIEndpoint()
    const key = `${endpoint}+${email.toLowerCase()}`
    if (this.requestsInFlight.has(key)) {
      return
    }
    if (this.failedRequests.has(key)) {
      return
    }

    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const account = getAccountForEndpoint(accounts, gitHubRepository.endpoint)
    if (!account) {
      return
    }

    this.requestsInFlight.add(key)

    let gitUser: IGitHubUser | null = null
    // We don't have email addresses for all the users in our database, e.g., if
    // the user has no public email. In that case, the email field is an empty
    // string. So searching with an empty email is gonna give us results, but
    // not results that are meaningful.
    if (email.length > 0) {
      gitUser =
        (await this.database.users
          .where('[endpoint+email]')
          .equals([account.endpoint, email.toLowerCase()])
          .limit(1)
          .first()) || null
    }

    // TODO: Invalidate the stored user in the db after ... some reasonable time
    // period.
    if (!gitUser) {
      gitUser = await this.findUserWithAPI(
        account,
        gitHubRepository,
        sha,
        email
      )
    }

    this.requestsInFlight.delete(key)

    if (gitUser) {
      await this.cacheUser(gitUser)
      this.emitUpdate()
    } else {
      this.failedRequests.add(key)
    }
  }

  private async findUserWithAPI(
    account: Account,
    repository: GitHubRepository,
    sha: string,
    email: string
  ): Promise<IGitHubUser | null> {
    const api = API.fromAccount(account)

    const apiCommit = await api.fetchCommit(
      repository.owner.login,
      repository.name,
      sha
    )

    if (apiCommit) {
      const { author } = apiCommit
      if (isValidAuthor(author)) {
        return {
          email,
          avatarURL: author.avatar_url,
          login: author.login,
          endpoint: account.endpoint,
          name: author.login,
        }
      }
    }

    const matchingUser = await api.searchForUserWithEmail(email)
    if (matchingUser) {
      return {
        email,
        login: matchingUser.login,
        avatarURL: matchingUser.avatar_url,
        endpoint: account.endpoint,
        name: matchingUser.login,
      }
    }

    return null
  }

  /** Store the user in the cache. */
  public async cacheUser(
    user: IGitHubUser,
    overwriteEmail: boolean = true
  ): Promise<IGitHubUser | null> {
    user = userWithLowerCase(user)

    let userMap = this.getUsersForEndpoint(user.endpoint)
    if (!userMap) {
      userMap = new Map<string, IGitHubUser>()
      this.usersByEndpoint.set(user.endpoint, userMap)
    }

    // We still store unknown emails as empty strings,
    // inserting that into cache would just create a
    // race condition of whoever gets added last
    if (user.email.length > 0) {
      userMap.set(user.email, user)
    }

    const addedUser = await this.database.transaction(
      'rw',
      this.database.users,
      async () => {
        const existing = await this.database.users
          .where('[endpoint+login]')
          .equals([user.endpoint, user.login])
          .toArray()
        const match = existing.find(e => e.email === user.email)
        if (match) {
          if (overwriteEmail) {
            user = { ...user, id: match.id }
          } else {
            user = { ...user, id: match.id, email: match.email }
          }
        }

        const id = await this.database.users.put(user)
        return this.database.users.get(id)
      }
    )

    return addedUser || null
  }

  /** Get the mentionable users in the repository. */
  public async getMentionableUsers(
    repository: GitHubRepository
  ): Promise<ReadonlyArray<IMentionableUser>> {
    const repositoryID = repository.dbID
    if (!repositoryID) {
      return fatalError(
        `Cannot get mentionables for a repository that hasn't been cached yet.`
      )
    }
    return this.database.getAllMentionablesForRepository(repositoryID)
  }

  /**
   * Get the mentionable users which match the text in some way.
   *
   * Hit results are ordered by how close in the search string
   * they matched. Search strings start with username and are followed
   * by real name. Only the first substring hit is considered
   *
   * @param text    A string to use when looking for a matching
   *                user. A user is considered a hit if this text
   *                matches any subtext of the username or real name
   *
   * @param maxHits The maximum number of hits to return.
   */
  public async getMentionableUsersMatching(
    repository: GitHubRepository,
    text: string,
    maxHits: number = 100
  ): Promise<ReadonlyArray<IMentionableUser>> {
    const users = await this.getMentionableUsers(repository)

    const hits = []
    const needle = text.toLowerCase()

    // Simple substring comparison on login and real name
    for (let i = 0; i < users.length && hits.length < maxHits; i++) {
      const user = users[i]
      const ix = `${user.login} ${user.name}`
        .trim()
        .toLowerCase()
        .indexOf(needle)

      if (ix >= 0) {
        hits.push({ user, ix })
      }
    }

    // Sort hits primarily based on how early in the text the match
    // was found and then secondarily using alphabetic order. Ideally
    // we'd use the GitHub user id in order to match dotcom behavior
    // but sadly we don't have it handy here. The id property on IGitHubUser
    // refers to our internal database id.
    return hits
      .sort(
        (x, y) => compare(x.ix, y.ix) || compare(x.user.login, y.user.login)
      )
      .map(h => h.user)
  }
}

/**
 * Returns a copy of the user instance with relevant properties lower cased.
 */
function userWithLowerCase(user: IGitHubUser): IGitHubUser {
  return {
    ...user,
    email: user.email.toLowerCase(),
    login: user.login.toLowerCase(),
  }
}
