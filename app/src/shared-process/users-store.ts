import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount } from '../lib/auth'
import { Account, IAccount } from '../models/account'

export class UsersStore {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private users: Account[]

  public constructor(dataStore: IDataStore, secureStore: ISecureStore) {
    this.dataStore = dataStore
    this.secureStore = secureStore
    this.users = []
  }

  public getUsers(): ReadonlyArray<Account> {
    return this.users.slice()
  }

  public addUser(user: Account) {
    this.secureStore.setItem(getKeyForAccount(user), user.login, user.token)

    this.users.push(user)

    this.save()
  }

  /** Remove the user from the store. */
  public removeUser(user: Account) {
    this.secureStore.deleteItem(getKeyForAccount(user), user.login)

    this.users = this.users.filter(u => u.id !== user.id)

    this.save()
  }

  /** Change the users in the store by mapping over them. */
  public async map(fn: (user: Account) => Promise<Account>) {
    const users = new Array<Account>()
    for (const user of this.users) {
      const newUser = await fn(user)
      users.push(newUser)
    }

    this.users = users
    this.save()
  }

  public loadFromStore() {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const rawUsers: ReadonlyArray<IAccount> = JSON.parse(raw)
    const usersWithTokens = rawUsers.map(user => {
      const userWithoutToken = new Account(user.login, user.endpoint, '', user.emails, user.avatarURL, user.id, user.name)
      const token = this.secureStore.getItem(getKeyForAccount(userWithoutToken), user.login)
      return userWithoutToken.withToken(token || '')
    })
    this.users = usersWithTokens
  }

  private save() {
    const usersWithoutTokens = this.users.map(user => user.withToken(''))
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
