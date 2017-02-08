import { Emitter, Disposable } from 'event-kit'
import { Repository } from '../../models/repository'
import { User } from '../../models/user'
import { GitHubRepository } from '../../models/github-repository'
import { API,  getUserForEndpoint, getDotComAPIEndpoint } from '../api'
import { GitHubUserDatabase, IGitHubUser } from './github-user-database'

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

  private getUsersForEndpoint(endpoint: string): Map<string, IGitHubUser> | null {
    return this.usersByEndpoint.get(endpoint) || null
  }

  /** Get the map of users for the repository. */
  public getUsersForRepository(repository: Repository): Map<string, IGitHubUser> | null {
    const endpoint = repository.gitHubRepository ? repository.gitHubRepository.endpoint : getDotComAPIEndpoint()
    return this.getUsersForEndpoint(endpoint)
  }

  public async updateMentionables(repository: GitHubRepository, user: User): Promise<void> {
    const api = new API(user)
    const mentionables = await api.fetchMentionables(repository.owner.login, repository.name)
    console.log(mentionables)
  }

  /** Not to be called externally. See `Dispatcher`. */
  public async _loadAndCacheUser(users: ReadonlyArray<User>, repository: Repository, sha: string | null, email: string) {
    const endpoint = repository.gitHubRepository ? repository.gitHubRepository.endpoint : getDotComAPIEndpoint()
    const key = `${endpoint}+${email.toLowerCase()}`
    if (this.requestsInFlight.has(key)) { return }

    const gitHubRepository = repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const user = getUserForEndpoint(users, gitHubRepository.endpoint)
    if (!user) {
      return
    }

    this.requestsInFlight.add(key)

    let gitUser: IGitHubUser | null = await this.database.users.where('[endpoint+email]')
      .equals([ user.endpoint, email.toLowerCase() ])
      .limit(1)
      .first()

    // TODO: Invalidate the stored user in the db after ... some reasonable time
    // period.
    if (!gitUser) {
      gitUser = await this.findUserWithAPI(user, gitHubRepository, sha, email)
    }

    if (gitUser) {
      this.cacheUser(gitUser)
    }

    this.requestsInFlight.delete(key)
    this.emitUpdate()
  }

  private async findUserWithAPI(user: User, repository: GitHubRepository, sha: string | null, email: string): Promise<IGitHubUser | null> {
    const api = new API(user)
    if (sha) {
      const apiCommit = await api.fetchCommit(repository.owner.login, repository.name, sha)
      if (apiCommit && apiCommit.author) {
        return {
          email,
          login: apiCommit.author.login,
          avatarURL: apiCommit.author.avatarUrl,
          endpoint: user.endpoint,
        }
      }
    }

    const matchingUser = await api.searchForUserWithEmail(email)
    if (matchingUser) {
      return {
        email,
        login: matchingUser.login,
        avatarURL: matchingUser.avatarUrl,
        endpoint: user.endpoint,
      }
    }

    return null
  }

  /** Store the user in the cache. */
  public async cacheUser(user: IGitHubUser): Promise<void> {
    user = userWithLowerCaseEmail(user)

    let userMap = this.getUsersForEndpoint(user.endpoint)
    if (!userMap) {
      userMap = new Map<string, IGitHubUser>()
      this.usersByEndpoint.set(user.endpoint, userMap)
    }

    userMap.set(user.email, user)

    const db = this.database
    await this.database.transaction('rw', this.database.users, function*() {
      const existing: IGitHubUser | null = yield db.users.where('[endpoint+email]')
        .equals([ user.endpoint, user.email ])
        .limit(1)
        .first()
      if (existing) {
        user = { ...user, id: existing.id }
      }

      yield db.users.put(user)
    })
  }
}

/**
 * Returns a copy of the user instance with the email property in
 * lower case. Returns the same instance if the email address is
 * already all lower case.
 */
function userWithLowerCaseEmail(user: IGitHubUser): IGitHubUser {
  const email = user.email.toLowerCase()
  return email === user.email
    ? user
    : { ...user, email }
}
