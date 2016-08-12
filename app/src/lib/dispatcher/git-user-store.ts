import { Emitter, Disposable } from 'event-kit'
import Repository from '../../models/repository'
import User from '../../models/user'
import GitHubRepository from '../../models/github-repository'
import API, { getUserForEndpoint, getDotComAPIEndpoint } from '../api'
import { GitUserDatabase, IGitUser } from './git-user-database'

/**
 * The store for git users. This is used to match commit authors to GitHub
 * users and avatars.
 */
export default class GitUserStore {
  private readonly emitter = new Emitter()

  private readonly requestsInFlight = new Set<string>()

  private readonly inMemoryCache = new Map<string, IGitUser>()

  private emitQueued = false

  private readonly database: GitUserDatabase

  public constructor(database: GitUserDatabase) {
    this.database = database
  }

  private emitUpdate() {
    if (this.emitQueued) { return }

    this.emitQueued = true

    window.requestAnimationFrame(() => {
      this.emitter.emit('did-update', {})
      this.emitQueued = false
    })
  }

  /** Register a function to be called when the store updates. */
  public onDidUpdate(fn: () => void): Disposable {
    return this.emitter.on('did-update', fn)
  }

  /** Get the cached git user for the repository and email. */
  public getUser(repository: Repository, email: string): IGitUser | null {
    const key = keyForRequest(email, repository.gitHubRepository ? repository.gitHubRepository.endpoint : getDotComAPIEndpoint())
    const user = this.inMemoryCache.get(key)
    return user ? user : null
  }

  /** Not to be called externally. See `Dispatcher`. */
  public async _loadAndCacheUser(users: ReadonlyArray<User>, repository: Repository, sha: string | null, email: string) {
    const key = keyForRequest(email, repository.gitHubRepository ? repository.gitHubRepository.endpoint : getDotComAPIEndpoint())
    if (this.requestsInFlight.has(key)) { return }

    const gitHubRepository = repository.gitHubRepository
    // TODO: Big ol' shrug if there's no GitHub repository. Maybe try Gravatar
    // instead?
    if (!gitHubRepository) {
      return
    }

    const user = getUserForEndpoint(users, gitHubRepository.endpoint)
    // TODO: Same as above. If they aren't logged in, maybe try Gravatar?
    if (!user) {
      return
    }

    this.requestsInFlight.add(key)

    let gitUser: IGitUser | null = await this.database.users.where('[endpoint+email]')
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

  private async findUserWithAPI(user: User, repository: GitHubRepository, sha: string | null, email: string): Promise<IGitUser | null> {
    const api = new API(user)
    if (sha) {
      const apiCommit = await api.fetchCommit(repository.owner.login, repository.name, sha)
      if (apiCommit) {
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
  public async cacheUser(user: IGitUser): Promise<void> {
    user = lowerCaseUser(user)

    const key = keyForRequest(user.email, user.endpoint)
    this.inMemoryCache.set(key, user)

    const db = this.database
    await this.database.transaction('rw', this.database.users, function*() {
      const existing: IGitUser | null = yield db.users.where('[endpoint+email]')
        .equals([ user.endpoint, user.email ])
        .limit(1)
        .first()
      if (existing) {
        user = Object.assign({}, user, { id: existing.id })
      }

      yield db.users.put(user)
    })
  }
}

function lowerCaseUser(user: IGitUser): IGitUser {
  return Object.assign({}, user, { email: user.email.toLowerCase() })
}

function keyForRequest(email: string, endpoint: string): string {
  return `${endpoint}/${email.toLowerCase()}`
}
