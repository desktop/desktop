import {Emitter, Disposable} from 'event-kit'

import {DataStore, SecureStore} from './stores'
import {getKeyForUser} from './auth'
import User from './user'

export default class UsersStore {
  private dataStore: DataStore
  private secureStore: SecureStore

  private emitter: Emitter
  private users: User[]

  public constructor(dataStore: DataStore, secureStore: SecureStore) {
    this.dataStore = dataStore
    this.secureStore = secureStore
    this.emitter = new Emitter()
    this.users = []
  }

  public onUsersChanged(fn: (users: User[]) => void): Disposable {
    return this.emitter.on('users-changed', fn)
  }

  private usersDidChange() {
    this.emitter.emit('users-changed', this.users)
  }

  public getUsers(): User[] {
    return this.users
  }

  public addUser(user: User) {
    this.secureStore.setItem(getKeyForUser(user), user.getLogin(), user.getToken())

    this.users.push(user)
    this.usersDidChange()

    this.save()
  }

  public loadFromStore() {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const rawUsers: any[] = JSON.parse(raw)
    const usersWithTokens = rawUsers.map(user => {
      const userWithoutToken = new User(user.login, user.endpoint, '')
      return userWithoutToken.userWithToken(this.secureStore.getItem(getKeyForUser(userWithoutToken), user.login))
    })
    this.users = usersWithTokens

    this.usersDidChange()
  }

  private save() {
    const usersWithoutTokens = this.users.map(user => user.userWithToken(''))
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
