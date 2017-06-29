import { Emitter, Disposable } from 'event-kit'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { GitHubRepository } from '../../models/github-repository'
import { API, getAccountForEndpoint, getDotComAPIEndpoint } from '../api'
import {
  GitHubUserDatabase,
  IGitHubUser,
  IMentionableAssociation,
} from './github-user-database'
import { fatalError } from '../fatal-error'

/**
 * The store for GitHub users. This is used to match commit authors to GitHub
 * users and avatars.
 */
export class GitHubUserStore {
  private readonly emitter = new Emitter()

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
    this.database = database
  }

  private emitUpdate() {
    this.emitter.emit('did-update', {})
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  private getUsersForEndpoint(
    endpoint: string
  ): Map<string, IGitHubUser> | null {
    return this.usersByEndpoint.get(endpoint) || null
  }

  /** Get the map of users for the repository. */
  public getUsersForRepository(
    repository: Repository
  ): Map<string, IGitHubUser> | null {
    const endpoint = repository.gitHubRepository
      ? repository.gitHubRepository.endpoint
      : getDotComAPIEndpoint()
    return this.getUsersForEndpoint(endpoint)
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

    const gitHubUsers: ReadonlyArray<IGitHubUser> = response.users.map(m => ({
      ...m,
      email: m.email || '',
      endpoint: account.endpoint,
      avatarURL: m.avatar_url,
    }))

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
      gitUser = await this.database.users
        .where('[endpoint+email]')
        .equals([account.endpoint, email.toLowerCase()])
        .limit(1)
        .first()
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
        return {
          email,
          login: apiCommit.author.login,
          avatarURL: apiCommit.author.avatar_url,
          endpoint: account.endpoint,
          name: apiCommit.author.name,
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
        name: matchingUser.name,
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

    userMap.set(user.email, user)

    const db = this.database
    let addedUser: IGitHubUser | null = null
    await this.database.transaction('rw', this.database.users, function*() {
      const existing: ReadonlyArray<IGitHubUser> = yield db.users
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

      const id = yield db.users.put(user)
      addedUser = yield db.users.get(id)
    })

    return addedUser
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
      return fatalError(
        `Cannot store a mentionable association for a user that hasn't been cached yet.`
      )
    }

    const repositoryID = repository.dbID
    if (!repositoryID) {
      return fatalError(
        `Cannot store a mentionable association for a repository that hasn't been cached yet.`
      )
    }

    const db = this.database
    await this.database.transaction(
      'rw',
      this.database.mentionables,
      function*() {
        const existing = yield db.mentionables
          .where('[userID+repositoryID]')
          .equals([userID, repositoryID])
          .limit(1)
          .first()
        if (existing) {
          return
        }

        yield db.mentionables.put({ userID, repositoryID })
      }
    )
  }

  /**
   * Pune the mentionable associations by removing any association that isn't in
   * the given array of users.
   */
  private async pruneRemovedMentionables(
    users: ReadonlyArray<IGitHubUser>,
    repository: GitHubRepository
  ) {
    const repositoryID = repository.dbID
    if (!repositoryID) {
      return fatalError(
        `Cannot prune removed mentionables for a repository that hasn't been cached yet.`
      )
    }

    const userIDs = new Set<number>()
    for (const user of users) {
      const userID = user.id
      if (!userID) {
        return fatalError(
          `Cannot prune removed mentionables with a user that hasn't been cached yet: ${user}`
        )
      }

      userIDs.add(userID)
    }

    const db = this.database
    await this.database.transaction(
      'rw',
      this.database.mentionables,
      function*() {
        const associations: ReadonlyArray<
          IMentionableAssociation
        > = yield db.mentionables
          .where('repositoryID')
          .equals(repositoryID)
          .toArray()

        for (const association of associations) {
          if (!userIDs.has(association.userID)) {
            yield db.mentionables.delete(association.id!)
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
    const db = this.database
    await this.database.transaction(
      'r',
      this.database.mentionables,
      this.database.users,
      function*() {
        const associations: ReadonlyArray<
          IMentionableAssociation
        > = yield db.mentionables
          .where('repositoryID')
          .equals(repositoryID)
          .toArray()

        for (const association of associations) {
          const user = yield db.users.get(association.userID)
          if (user) {
            users.push(user)
          }
        }
      }
    )

    return users
  }

  /** Get the mentionable users which match the text in some way. */
  public async getMentionableUsersMatching(
    repository: GitHubRepository,
    text: string
  ): Promise<ReadonlyArray<IGitHubUser>> {
    const users = await this.getMentionableUsers(repository)

    const MaxScore = 1
    const score = (u: IGitHubUser) => {
      const login = u.login
      if (login && login.toLowerCase().startsWith(text.toLowerCase())) {
        return MaxScore
      }

      // `name` shouldn't even be `undefined` going forward, but older versions
      // of the user cache didn't persist `name`. The `GitHubUserStore` will fix
      // that, but autocompletions could be requested before that happens. So we
      // need to check here even though the type says its superfluous.
      const name = u.name
      if (name && name.toLowerCase().includes(text.toLowerCase())) {
        return MaxScore - 0.1
      }

      return 0
    }

    return users.filter(u => score(u) > 0).sort((a, b) => score(b) - score(a))
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
