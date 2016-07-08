import {ipcRenderer} from 'electron'
import {Disposable} from 'event-kit'
import User, {IUser} from '../../models/user'
import Repository, {IRepository} from '../../models/repository'
import guid from '../guid'
import {AppState} from '../app-state'
import {Action} from './actions'
import {APIRepository} from '../api'

/**
 * The Dispatcher acts as the hub for state. The StateHub if you will. It
 * decouples the consumer of state from where/how it is stored.
 */
export class Dispatcher {
  private dispatch<T>(action: Action): Promise<T> {
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

  public async addRepositories(repositories: Repository[]): Promise<Repository[]> {
    const json = await this.dispatch<IRepository[]>({name: 'add-repositories', repositories})
    return json.map(r => Repository.fromJSON(r))
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

  /** Update the repository's GitHub repository. */
  public updateGitHubRepository(repository: Repository, apiRepository: APIRepository): Promise<void> {
    return this.dispatch<void>({name: 'update-github-repository', repository, apiRepository})
  }
}
