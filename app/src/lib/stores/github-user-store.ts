import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { API, getAccountForEndpoint, getDotComAPIEndpoint } from '../api'
import {
  GitHubUserDatabase,
  IGitHubUser,
} from '../databases/github-user-database'
import { getAvatarWithEnterpriseFallback } from '../gravatar'

import { fatalError } from '../fatal-error'
import { compare } from '../compare'
import { BaseStore } from './base-store'

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

  /** Get the map of users for the repository. */
  public getUsersForRepository(
    repository: Repository
  ): Map<string, IGitHubUser> {
    const endpoint = repository.gitHubRepository
      ? repository.gitHubRepository.endpoint
      : getDotComAPIEndpoint()
    return this.getUsersForEndpoint(endpoint) || new Map<string, IGitHubUser>()
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
  ): Promise<IGitHubUser | null> {
    const existing = await this.database.users
      .where('[endpoint+login]')
      .equals([account.endpoint, login])
      .first()

    if (existing) {
      return existing
    }

    const api = API.fromAccount(account)
    const apiUser = await api.fetchUser(login).catch(e => null)

    if (!apiUser || apiUser.type !== 'User') {
      return null
    }

    const avatarURL = getAvatarWithEnterpriseFallback(
      apiUser.avatar_url,
      apiUser.email,
      account.endpoint
    )

    const user: IGitHubUser = {
      avatarURL,
      email: apiUser.email || '',
      endpoint: account.endpoint,
      name: apiUser.name || apiUser.login,
      login: apiUser.login,
    }

    // We don't overwrite email addresses since we might not get one from this
    // endpoint, but we could already have one from looking up a commit
    // specifically.
    return await this.cacheUser(user, false)
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
    if (!response) {
      return
    }
    if (!response.users) {
      return
    }

    if (response.etag) {
      this.mentionablesEtags.set(repositoryID, response.etag)
    }

    const gitHubUsers: ReadonlyArray<IGitHubUser> = response.users.map(m => {
      const email = m.email || ''

      return {
        ...m,
        email,
        endpoint: account.endpoint,
        avatarURL: getAvatarWithEnterpriseFallback(
          m.avatar_url,
          email,
          account.endpoint
        ),
      }
    })

    const cachedUsers = new Array<IGitHubUser>()
    for (const user of gitHubUsers) {
      // We don't overwrite email addresses since we might not get one from this
      // endpoint, but we could already have one from looking up a commit
      // specifically.
      const cachedUser = await this.cacheUser(user, false)
      if (cachedUser) {
        cachedUsers.push(cachedUser)
      }
    }

    for (const user of cachedUsers) {
      await this.storeMentionable(user, repository)
    }

    await this.pruneRemovedMentionables(cachedUsers, repository)

    this.emitUpdate()
  }

  /** Not to be called externally. See `Dispatcher`. */
  public async _loadAndCacheUser(
    accounts: ReadonlyArray<Account>,
    repository: Repository,
    sha: string | null,
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
    sha: string | null,
    email: string
  ): Promise<IGitHubUser | null> {
    const api = API.fromAccount(account)
    if (sha) {
      const apiCommit = await api.fetchCommit(
        repository.owner.login,
        repository.name,
        sha
      )
      if (apiCommit && apiCommit.author) {
        const avatarURL = getAvatarWithEnterpriseFallback(
          apiCommit.author.avatar_url,
          email,
          account.endpoint
        )

        return {
          email,
          avatarURL,
          login: apiCommit.author.login,
          endpoint: account.endpoint,
          name: apiCommit.author.name || apiCommit.author.login,
        }
      }
    }

    const matchingUser = await api.searchForUserWithEmail(email)
    if (matchingUser) {
      const avatarURL = getAvatarWithEnterpriseFallback(
        matchingUser.avatar_url,
        email,
        account.endpoint
      )
      return {
        email,
        login: matchingUser.login,
        avatarURL,
        endpoint: account.endpoint,
        name: matchingUser.name || matchingUser.login,
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

  /**
   * Store a mentionable association between the user and repository.
   *
   * Note that both the user and the repository *must* have already been cached
   * before calling this method. Otherwise it will throw.
   */
  private async storeMentionable(
    user: IGitHubUser,
    repository: GitHubRepository
  ) {
    const userID = user.id
    if (!userID) {
      fatalError(
        `Cannot store a mentionable association for a user that hasn't been cached yet.`
      )
      return
    }

    const repositoryID = repository.dbID
    if (!repositoryID) {
      fatalError(
        `Cannot store a mentionable association for a repository that hasn't been cached yet.`
      )
      return
    }

    await this.database.transaction(
      'rw',
      this.database.mentionables,
      async () => {
        const existing = await this.database.mentionables
          .where('[userID+repositoryID]')
          .equals([userID, repositoryID])
          .limit(1)
          .first()
        if (existing) {
          return
        }

        await this.database.mentionables.put({ userID, repositoryID })
      }
    )
  }

  /**
   * Prune the mentionable associations by removing any association that isn't in
   * the given array of users.
   */
  private async pruneRemovedMentionables(
    users: ReadonlyArray<IGitHubUser>,
    repository: GitHubRepository
  ) {
    const repositoryID = repository.dbID
    if (!repositoryID) {
      fatalError(
        `Cannot prune removed mentionables for a repository that hasn't been cached yet.`
      )
      return
    }

    const userIDs = new Set<number>()
    for (const user of users) {
      const userID = user.id
      if (!userID) {
        fatalError(
          `Cannot prune removed mentionables with a user that hasn't been cached yet: ${user}`
        )
        return
      }

      userIDs.add(userID)
    }

    await this.database.transaction(
      'rw',
      this.database.mentionables,
      async () => {
        const associations = await this.database.mentionables
          .where('repositoryID')
          .equals(repositoryID)
          .toArray()

        for (const association of associations) {
          if (!userIDs.has(association.userID)) {
            await this.database.mentionables.delete(association.id!)
          }
        }
      }
    )
  }

  /** Get the mentionable users in the repository. */
  public async getMentionableUsers(
    repository: GitHubRepository
  ): Promise<ReadonlyArray<IGitHubUser>> {
    const repositoryID = repository.dbID
    if (!repositoryID) {
      return fatalError(
        `Cannot get mentionables for a repository that hasn't been cached yet.`
      )
    }

    const users = new Array<IGitHubUser>()
    await this.database.transaction(
      'r',
      this.database.mentionables,
      this.database.users,
      async () => {
        const associations = await this.database.mentionables
          .where('repositoryID')
          .equals(repositoryID)
          .toArray()

        for (const association of associations) {
          const user = await this.database.users.get(association.userID)
          if (user) {
            users.push(user)
          }
        }
      }
    )

    return users
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
  ): Promise<ReadonlyArray<IGitHubUser>> {
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
