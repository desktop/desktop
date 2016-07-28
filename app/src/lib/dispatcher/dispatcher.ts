import { ipcRenderer } from 'electron'
import User, { IUser } from '../../models/user'
import Repository, { IRepository } from '../../models/repository'
import guid from '../guid'
import { IHistorySelection } from '../app-state'
import { Action } from './actions'
import AppStore from './app-store'
import { LocalGitOperations, Commit } from '../local-git-operations'
import { FileChange } from '../../models/status'

/**
 * Extend Error so that we can create new Errors with a callstack different from
 * the callsite.
 */
class IPCError extends Error {
  public readonly message: string
  public readonly stack: string

  public constructor(name: string, message: string, stack: string) {
    super(name)
    this.name = name
    this.message = message
    this.stack = stack
  }
}

interface IResult<T> {
  type: 'result'
  readonly result: T
}

interface IError {
  type: 'error'
  readonly error: Error
}

type IPCResponse<T> = IResult<T> | IError

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private store: AppStore

  public constructor(store: AppStore) {
    this.store = store

    this.fetchInitialState()
  }

  private async fetchInitialState() {
    const users = await this.getUsers()
    const repositories = await this.getRepositories()
    this.store._users = users
    this.store._repositories = repositories
    this.store._emitUpdate()
  }

  private dispatch<T>(action: Action): Promise<T> {
    return this.send(action.name, action)
  }

  private send<T>(name: string, args: Object): Promise<T> {
    let resolve: ((value: T) => void) | null = null
    let reject: ((error: Error) => void) | null = null
    const promise = new Promise<T>((_resolve, _reject) => {
      resolve = _resolve
      reject = _reject
    })

    const requestGuid = guid()
    ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
      const response: IPCResponse<T> = args[0]
      if (response.type === 'result') {
        resolve!(response.result)
      } else {
        const errorInfo = response.error
        const error = new IPCError(errorInfo.name, errorInfo.message, errorInfo.stack || '')
        if (__DEV__) {
          console.error(`Error from IPC in response to ${name}:`)
          console.error(error)
        }

        reject!(error)
      }
    })

    ipcRenderer.send('shared/request', [ { guid: requestGuid, name, args } ])
    return promise
  }

  /** Get the users */
  private async getUsers(): Promise<ReadonlyArray<User>> {
    const json = await this.dispatch<ReadonlyArray<IUser>>({ name: 'get-users' })
    return json.map(User.fromJSON)
  }

  /** Get the repositories the user has added to the app. */
  private async getRepositories(): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatch<ReadonlyArray<IRepository>>({ name: 'get-repositories' })
    return json.map(Repository.fromJSON)
  }

  public async addRepositories(repositories: ReadonlyArray<Repository>): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatch<ReadonlyArray<IRepository>>({ name: 'add-repositories', repositories })
    return json.map(Repository.fromJSON)
  }

  /** Request the user approve our OAuth request. This will open their browser. */
  public requestOAuth(): Promise<void> {
    return this.dispatch<void>({ name: 'request-oauth' })
  }

  /** Update the repository's GitHub repository. */
  public updateGitHubRepository(repository: Repository): Promise<void> {
    return this.dispatch<void>({ name: 'update-github-repository', repository })
  }

  public async loadHistory(repository: Repository): Promise<void> {
    const commits = await LocalGitOperations.getHistory(repository)
    this.store._history = {
      commits,
      selection: this.store._history.selection,
      changedFiles: this.store._history.changedFiles,
    }
    this.store._emitUpdate()

    this.store._historyByRepositoryID[repository.id!] = this.store._history
  }

  public async loadChangedFilesForCurrentSelection(repository: Repository): Promise<void> {
    const selection = this.store._history.selection
    const currentCommit = selection.commit
    if (!currentCommit) { return }

    const changedFiles = await LocalGitOperations.getChangedFiles(repository, currentCommit.sha)

    // The selection could have changed between when we started loading the
    // changed files and we finished.
    if (currentCommit !== this.store._history.selection.commit) {
      return
    }

    this.store._history = {
      commits: this.store._history.commits,
      selection,
      changedFiles,
    }
    this.store._emitUpdate()

    this.store._historyByRepositoryID[repository.id!] = this.store._history
  }

  public async changeHistorySelection(repository: Repository, selection: IHistorySelection): Promise<void> {
    const commitChanged = this.store._history.selection.commit !== selection.commit
    const changedFiles = commitChanged ? new Array<FileChange>() : this.store._history.changedFiles

    this.store._history = {
      commits: this.store._history.commits,
      selection,
      changedFiles,
    }
    this.store._emitUpdate()

    this.store._historyByRepositoryID[repository.id!] = this.store._history
  }

  public async selectRepository(repository: Repository): Promise<void> {
    this.store._selectedRepository = repository

    const history = this.store._historyByRepositoryID[repository.id!]
    if (history) {
      this.store._history = history
    } else {
      this.store._history = {
        commits: new Array<Commit>(),
        selection: {
          commit: null,
          file: null,
        },
        changedFiles: new Array<FileChange>(),
      }
    }

    this.store._emitUpdate()

    await this.loadHistory(repository)
    this.store._emitUpdate()

    return Promise.resolve()
  }
}
