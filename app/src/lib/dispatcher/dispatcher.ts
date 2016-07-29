import { ipcRenderer } from 'electron'
import User, { IUser } from '../../models/user'
import Repository, { IRepository } from '../../models/repository'
import { WorkingDirectoryFileChange } from '../../models/status'
import guid from '../guid'
import { IHistorySelection, RepositorySection } from '../app-state'
import { Action } from './actions'
import AppStore from './app-store'

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

    ipcRenderer.on('shared/did-update', (event, args) => this.onSharedDidUpdate(event, args))
  }

  public async loadInitialState(): Promise<void> {
    const users = await this.loadUsers()
    const repositories = await this.loadRepositories()
    this.store._loadFromSharedProcess(users, repositories)
  }

  private dispatchToSharedProcess<T>(action: Action): Promise<T> {
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

  private onSharedDidUpdate(event: Electron.IpcRendererEvent, args: any[]) {
    const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
    const inflatedUsers = state.users.map(User.fromJSON)
    const inflatedRepositories = state.repositories.map(Repository.fromJSON)
    this.store._loadFromSharedProcess(inflatedUsers, inflatedRepositories)
  }

  /** Get the users */
  private async loadUsers(): Promise<ReadonlyArray<User>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IUser>>({ name: 'get-users' })
    return json.map(User.fromJSON)
  }

  /** Get the repositories the user has added to the app. */
  private async loadRepositories(): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IRepository>>({ name: 'get-repositories' })
    return json.map(Repository.fromJSON)
  }

  public async addRepositories(repositories: ReadonlyArray<Repository>): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatchToSharedProcess<ReadonlyArray<IRepository>>({ name: 'add-repositories', repositories })
    return json.map(Repository.fromJSON)
  }

  /** Request the user approve our OAuth request. This will open their browser. */
  public requestOAuth(): Promise<void> {
    return this.dispatchToSharedProcess<void>({ name: 'request-oauth' })
  }

  /** Update the repository's GitHub repository. */
  public updateGitHubRepository(repository: Repository): Promise<void> {
    return this.dispatchToSharedProcess<void>({ name: 'update-github-repository', repository })
  }

  public loadHistory(repository: Repository): Promise<void> {
    return this.store._loadHistory(repository)
  }

  public loadChangedFilesForCurrentSelection(repository: Repository): Promise<void> {
    return this.store._loadChangedFilesForCurrentSelection(repository)
  }

  public changeHistorySelection(repository: Repository, selection: IHistorySelection): Promise<void> {
    return this.store._changeHistorySelection(repository, selection)
  }

  public selectRepository(repository: Repository): Promise<void> {
    return this.store._selectRepository(repository)
  }

  public loadStatus(repository: Repository): Promise<void> {
    return this.store._loadStatus(repository)
  }

  public changeRepositorySection(repository: Repository, section: RepositorySection): Promise<void> {
    return this.store._changeRepositorySection(repository, section)
  }

  public changeChangesSelection(repository: Repository, selectedFile: WorkingDirectoryFileChange | null): Promise<void> {
    return this.store._changeChangesSelection(repository, selectedFile)
  }

  /**
   * Commit the changes which were marked for inclusion, using the given commit
   * title.
   */
  public commitIncludedChanges(repository: Repository, title: string): Promise<void> {
    return this.store._commitIncludedChanges(repository, title)
  }

  public changeFileIncluded(repository: Repository, file: WorkingDirectoryFileChange, include: boolean): Promise<void> {
    return this.store._changeFileIncluded(repository, file, include)
  }

  public changeIncludeAllFiles(repository: Repository, includeAll: boolean): Promise<void> {
    return this.store._changeIncludeAllFiles(repository, includeAll)
  }
}
