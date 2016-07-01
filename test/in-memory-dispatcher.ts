import {Disposable} from 'event-kit'
import Dispatcher from '../src/dispatcher'
import User from '../src/models/user'
import Repository from '../src/models/repository'

type State = {users: User[], repositories: Repository[]}

export default class InMemoryDispatcher extends Dispatcher {
  public getUsers(): Promise<User[]> {
    return Promise.resolve([])
  }

  public getRepositories(): Promise<Repository[]> {
    return Promise.resolve([])
  }

  public requestOAuth(): Promise<void> {
    return Promise.resolve()
  }

  public onDidUpdate(fn: (state: State) => void): Disposable {
    return new Disposable(() => {})
  }
}
