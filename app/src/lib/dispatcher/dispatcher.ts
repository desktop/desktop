import {ipcRenderer} from 'electron'
import {Disposable} from 'event-kit'
import User, {IUser} from '../../models/user'
import Repository, {IRepository} from '../../models/repository'
import guid from '../guid'
import {IAppState} from '../app-state'
import {Action} from './actions'

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

    ipcRenderer.send('shared/request', [{guid: requestGuid, name, args}])
    return promise
  }

  /** Get the users */
  public async getUsers(): Promise<ReadonlyArray<User>> {
    const json = await this.dispatch<ReadonlyArray<IUser>>({name: 'get-users'})
    return json.map(User.fromJSON)
  }

  /** Get the repositories the user has added to the app. */
  public async getRepositories(): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatch<ReadonlyArray<IRepository>>({name: 'get-repositories'})
    return json.map(Repository.fromJSON)
  }

  public async addRepositories(repositories: ReadonlyArray<Repository>): Promise<ReadonlyArray<Repository>> {
    const json = await this.dispatch<ReadonlyArray<IRepository>>({name: 'add-repositories', repositories})
    return json.map(Repository.fromJSON)
  }

  /** Request the user approve our OAuth request. This will open their browser. */
  public requestOAuth(): Promise<void> {
    return this.dispatch<void>({name: 'request-oauth'})
  }

  /** Register a listener function to be called when the state updates. */
  public onDidUpdate(fn: (state: IAppState) => void): Disposable {
    const wrappedFn = (event: Electron.IpcRendererEvent, args: any[]) => {
      const state: {repositories: ReadonlyArray<IRepository>, users: ReadonlyArray<IUser>} = args[0].state
      const users = state.users.map(User.fromJSON)
      const repositories = state.repositories.map(Repository.fromJSON)
      fn({users, repositories})
    }
    ipcRenderer.on('shared/did-update', wrappedFn)
    return new Disposable(() => {
      ipcRenderer.removeListener('shared/did-update', wrappedFn)
    })
  }

  /** Update the repository's GitHub repository. */
  public updateGitHubRepository(repository: Repository): Promise<void> {
    return this.dispatch<void>({name: 'update-github-repository', repository})
  }
}
