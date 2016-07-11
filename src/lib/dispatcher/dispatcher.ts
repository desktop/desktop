import {ipcRenderer} from 'electron'
import {Disposable} from 'event-kit'
import User, {IUser} from '../../models/user'
import Repository, {IRepository} from '../../models/repository'
import guid from '../guid'
import {AppState} from '../app-state'
import {Action} from './actions'

/**

interface IResult<T> {
  type: 'result'
  result: T
}

interface IError {
  type: 'error'
  error: Error
}

type IPCResponse<T> = IResult<T> | IError

 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private dispatch<T>(action: Action): Promise<T> {
    return this.send(action.name, action)
  }

  private send<T>(name: string, args: Object): Promise<T> {
    let resolve: (value: T) => void = null
    let reject: (error: Error) => void = null
    const promise = new Promise<T>((_resolve, reject_) => {
      resolve = _resolve
      reject = reject_
    })

    const requestGuid = guid()
    ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
      const response: IPCResponse<T> = args[0]
      if (response.type === 'result') {
        resolve((response as IResult<T>).result)
      } else {
        const error = (response as IError).error
        reject(error)
      }
    })

    ipcRenderer.send('shared/request', [{guid: requestGuid, name, args}])
    return promise
  }

  /** Get the users */
  public async getUsers(): Promise<User[]> {
    const json = await this.dispatch<IUser[]>({name: 'get-users'})
    return json.map(User.fromJSON)
  }

  /** Get the repositories the user has added to the app. */
  public async getRepositories(): Promise<Repository[]> {
    const json = await this.dispatch<IRepository[]>({name: 'get-repositories'})
    return json.map(Repository.fromJSON)
  }

  public async addRepositories(repositories: Repository[]): Promise<Repository[]> {
    const json = await this.dispatch<IRepository[]>({name: 'add-repositories', repositories})
    return json.map(Repository.fromJSON)
  }

  /** Request the user approve our OAuth request. This will open their browser. */
  public requestOAuth(): Promise<void> {
    return this.dispatch<void>({name: 'request-oauth'})
  }

  /** Register a listener function to be called when the state updates. */
  public onDidUpdate(fn: (state: AppState) => void): Disposable {
    const wrappedFn = (event: Electron.IpcRendererEvent, args: any[]) => {
      const state: {repositories: IRepository[], users: IUser[]} = args[0].state
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
