import { Emitter, Disposable } from 'event-kit'
import Repository from '../../models/repository'
import User from '../../models/user'
import API, { getUserForEndpoint } from '../api'

export interface IGitUser {
  login: string | null
  avatarURL: string
}

const DefaultGitUser: IGitUser = {
  login: null,
  avatarURL: 'https://github.com/hubot.png',
}

/**
 * The store for git users. This is used to match commit authors to GitHub
 * users and avatars.
 */
export default class GitUserStore {
  private emitter = new Emitter()

  private requestsInFlight = new Set<string>()

  private users = new Map<string, IGitUser>()

  private emitQueued = false

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
  public getUser(repository: Repository, email: string): IGitUser {
    const key = keyForRequest(repository, email)
    const user = this.users.get(key)
    if (user) {
      return user
    } else {
      return DefaultGitUser
    }
  }

  /** Not to be called externally. See `Dispatcher`. */
  public async _loadUser(users: ReadonlyArray<User>, repository: Repository, sha: string, email: string) {
    const key = keyForRequest(repository, email)
    if (this.requestsInFlight.has(key)) { return }

    const gitHubRepository = repository.gitHubRepository
    // Big ol' shrug if there's no GitHub repository. Maybe try Gravatar instead?
    if (!gitHubRepository) {
      return
    }

    const user = getUserForEndpoint(users, gitHubRepository.endpoint)
    // Same as above. If they aren't logged in, maybe try Gravatar?
    if (!user) {
      return
    }

    this.requestsInFlight.add(key)

    const done = () => {
      this.requestsInFlight.delete(key)
      this.emitUpdate()
    }

    const api = new API(user)
    const apiCommit = await api.fetchCommit(gitHubRepository.owner.login, gitHubRepository.name, sha)
    if (apiCommit) {
      const gitUser: IGitUser = {
        login: apiCommit.author.login,
        avatarURL: apiCommit.author.avatarUrl,
      }
      this.users.set(key, gitUser)
      done()
      return
    }

    const matchingUser = await api.searchForUserWithEmail(email)
    if (matchingUser) {
      const gitUser: IGitUser = {
        login: matchingUser.login,
        avatarURL: matchingUser.avatarUrl,
      }
      this.users.set(key, gitUser)
    }

    done()
  }
}

function keyForRequest(repository: Repository, email: string): string {
  return `${repository.id}/${email}`
}
