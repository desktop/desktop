import { Emitter, Disposable } from 'event-kit'
import Repository from '../../models/repository'
import User from '../../models/user'
import GitHubRepository from '../../models/github-repository'
import API, { getUserForEndpoint } from '../api'
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
    const key = keyForRequest(repository, email)
    const user = this.inMemoryCache.get(key)
    return user ? user : null
  }

  /** Not to be called externally. See `Dispatcher`. */
  public async _loadAndCacheUser(users: ReadonlyArray<User>, repository: Repository, sha: string, email: string) {
    const key = keyForRequest(repository, email)
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
      .equals([ user.endpoint, email ])
      .limit(1)
      .first()

    // TODO: Invalidate the stored user in the db after ... some reasonable time
    // period.
    if (!gitUser) {
      gitUser = await this.findUserWithAPI(user, gitHubRepository, sha, email)
    }

    if (gitUser) {
      this.inMemoryCache.set(key, gitUser)

      if (!gitUser.id) {
        await this.database.users.add(gitUser)
      }
    }

    this.requestsInFlight.delete(key)
    this.emitUpdate()
  }

  private async findUserWithAPI(user: User, repository: GitHubRepository, sha: string, email: string): Promise<IGitUser | null> {
    const api = new API(user)
    const apiCommit = await api.fetchCommit(repository.owner.login, repository.name, sha)
    if (apiCommit) {
      return {
        email,
        login: apiCommit.author.login,
        avatarURL: apiCommit.author.avatarUrl,
        endpoint: user.endpoint,
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
}

function keyForRequest(repository: Repository, email: string): string {
  return `${repository.id}/${email}`
}
