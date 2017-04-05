import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount } from '../lib/auth'
import { Account, IAccount } from '../models/account'

export class AccountsStore {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private accounts: Account[]

  public constructor(dataStore: IDataStore, secureStore: ISecureStore) {
    this.dataStore = dataStore
    this.secureStore = secureStore
    this.accounts = []
  }

  public getUsers(): ReadonlyArray<Account> {
    return this.accounts.slice()
  }

  public addUser(account: Account) {
    this.secureStore.setItem(getKeyForAccount(account), account.login, account.token)

    this.accounts.push(account)

    this.save()
  }

  /** Remove the user from the store. */
  public removeUser(account: Account) {
    this.secureStore.deleteItem(getKeyForAccount(account), account.login)

    this.accounts = this.accounts.filter(account => account.id !== account.id)

    this.save()
  }

  /** Change the users in the store by mapping over them. */
  public async map(fn: (account: Account) => Promise<Account>) {
    const accounts = new Array<Account>()
    for (const account of this.accounts) {
      const newUser = await fn(account)
      accounts.push(newUser)
    }

    this.accounts = accounts
    this.save()
  }

  public loadFromStore() {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const rawAccounts: ReadonlyArray<IAccount> = JSON.parse(raw)
    const accountsWithTokens = rawAccounts.map(account => {
      const userWithoutToken = new Account(account.login, account.endpoint, '', account.emails, account.avatarURL, account.id, account.name)
      const token = this.secureStore.getItem(getKeyForAccount(userWithoutToken), account.login)
      return userWithoutToken.withToken(token || '')
    })
    this.accounts = accountsWithTokens
  }

  private save() {
    const usersWithoutTokens = this.accounts.map(account => account.withToken(''))
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
