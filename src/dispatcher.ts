import {ipcRenderer} from 'electron'
import {Disposable} from 'event-kit'
import User, {IUser} from './models/user'
import Repository, {IRepository} from './models/repository'
import guid from './lib/guid'
import {AppState} from './lib/app-state'

interface GetUsersAction {
  name: 'get-users'
}

interface GetRepositoriesAction {
  name: 'get-repositories'
}

interface AddRepositoryAction {
  name: 'add-repositories'
  repositories: Repository[]
}

interface RequestOAuthAction {
  name: 'request-oauth'
}

interface FindGitHubRepositoryAction {
  name: 'find-github-repository'
  remoteURL: string
}

export interface AppState {
  users: User[]
  repositories: Repository[]
}

type Action = GetUsersAction | GetRepositoriesAction |
              AddRepositoryAction | RequestOAuthAction

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export default class Dispatcher {
  private dispatch<T>(action: Action): Promise<T> {
    const copiedAction = Object.assign({}, action)
    delete copiedAction.name
    return this.send(action.name, action)
  }

  private send<T>(name: string, args: Object): Promise<T> {
    let resolve: (value: T) => void = null
    const promise = new Promise<T>((_resolve, reject) => {
      resolve = _resolve
    })

    const requestGuid = guid()
    ipcRenderer.once(`shared/response/${requestGuid}`, (event: any, args: any[]) => {
      resolve(args[0] as T)
    })

    ipcRenderer.send('shared/request', [{guid: requestGuid, name, args}])
    return promise
  }

  /** Get the users */
  public async getUsers(): Promise<User[]> {
    const json = await this.dispatch<IUser[]>({name: 'get-users'})
    return json.map(u => User.fromJSON(u))
  }

  /** Get the repositories the user has added to the app. */
  public async getRepositories(): Promise<Repository[]> {
    const json = await this.dispatch<IRepository[]>({name: 'get-repositories'})
    return json.map(r => Repository.fromJSON(r))
  }

  public addRepositories(repositories: Repository[]): Promise<void> {
    return this.dispatch<void>({name: 'add-repositories', repositories})
  }

  /** Request the user approve our OAuth request. This will open their browser. */
  public requestOAuth(): Promise<void> {
    return this.dispatch<void>({name: 'request-oauth'})
  }

  /** Register a listener function to be called when the state updates. */
  public onDidUpdate(fn: (state: AppState) => void): Disposable {
    const wrappedFn = (event: Electron.IpcRendererEvent, args: any[]) => {
      const state: {repositories: IRepository[], users: IUser[]} = args[0].state
      const users = state.users.map(u => User.fromJSON(u))
      const repositories = state.repositories.map(r => Repository.fromJSON(r))
      fn({users, repositories})
    }
    ipcRenderer.on('shared/did-update', wrappedFn)
    return new Disposable(() => {
      ipcRenderer.removeListener('shared/did-update', wrappedFn)
    })
  }
}
