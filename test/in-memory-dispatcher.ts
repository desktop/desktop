import {Disposable} from 'event-kit'
import {Dispatcher} from '../src/lib/dispatcher'
import User from '../src/models/user'
import Repository from '../src/models/repository'

type State = {users: ReadonlyArray<User>, repositories: ReadonlyArray<Repository>}

export default class InMemoryDispatcher extends Dispatcher {
  public getUsers(): Promise<ReadonlyArray<User>> {
    return Promise.resolve([])
  }

  public getRepositories(): Promise<ReadonlyArray<Repository>> {
    return Promise.resolve([])
  }

  public requestOAuth(): Promise<void> {
    return Promise.resolve()
  }

  public onDidUpdate(fn: (state: State) => void): Disposable {
    return new Disposable(() => {})
  }
}
