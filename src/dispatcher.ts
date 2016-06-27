import {ipcRenderer} from 'electron'
import {Disposable} from 'event-kit'
import User from './user'
import guid from './lib/guid'

interface GetUsersAction {
  name: 'get-users'
}

interface GetRepositoriesAction {
  name: 'get-repositories'
}

interface AddUserAction {
  name: 'add-user'
  user: User
}

interface RemoveUserAction {
  name: 'remove-user'
  user: User
}

interface AddRepositoryAction {
  name: 'add-repo'
}

interface RemoveRepositoryAction {
  name: 'remove-repo'
}

type Repository = void

type State = {users: User[], repositories: Repository[]}

type Action = GetUsersAction | GetRepositoriesAction |
              AddUserAction | RemoveUserAction |
              AddRepositoryAction | RemoveRepositoryAction

export default class Dispatcher {
  public constructor() {

  }

  private dispatch<T>(action: Action, args: any): Promise<T> {
    return this.send(action.name, args)
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

  public async getUsers(): Promise<User[]> {
    const json = await this.dispatch<string>({name: 'get-users'}, {})
    const jsonArray: any[] = JSON.parse(json)
    return jsonArray.map(u => User.fromJSON(u))
  }

  public getRepositories(): Promise<Repository[]> {
    // TODO: Map from JSON => Repo
    return this.dispatch({name: 'get-repositories'}, {})
  }

  private getState(): State {
    return {users: [], repositories: []}
  }

  public onDidUpdate(fn: (state: State) => void): Disposable {
    const wrappedFn = () => {
      fn(this.getState())
    }
    ipcRenderer.on('shared/did-update', wrappedFn)
    return new Disposable(() => {
      ipcRenderer.removeListener('shared/did-update', wrappedFn)
    })
  }
}
