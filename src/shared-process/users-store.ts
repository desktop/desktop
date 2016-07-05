import {DataStore, SecureStore} from './stores'
import {getKeyForUser} from './auth'
import User from '../models/user'

export default class UsersStore {
  private dataStore: DataStore
  private secureStore: SecureStore

  private users: User[]

  public constructor(dataStore: DataStore, secureStore: SecureStore) {
    this.dataStore = dataStore
    this.secureStore = secureStore
    this.users = []
  }

  public getUsers(): User[] {
    return this.users
  }

  public addUser(user: User) {
    this.secureStore.setItem(getKeyForUser(user), user.login, user.token)

    this.users.push(user)

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
  }

  private save() {
    const usersWithoutTokens = this.users.map(user => user.userWithToken(''))
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
