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

  /**
   * Get the list of accounts in the cache.
   */
  public getAll(): ReadonlyArray<Account> {
    return this.accounts.slice()
  }

  /**
   * Add the account to the store.
   */
  public async addAccount(account: Account): Promise<void> {
    await this.secureStore.setItem(getKeyForAccount(account), account.login, account.token)

    this.accounts.push(account)

    this.save()
  }

  /**
   * Remove the account from the store.
   */
  public async removeAccount(account: Account): Promise<void> {
    await this.secureStore.deleteItem(getKeyForAccount(account), account.login)

    this.accounts = this.accounts.filter(a => a.id !== account.id)

    this.save()
  }

  /**
   * Update the users in the store by mapping over them.
   */
  public async map(fn: (account: Account) => Promise<Account>) {
    const accounts = new Array<Account>()
    for (const account of this.accounts) {
      const newAccount = await fn(account)
      accounts.push(newAccount)
    }

    this.accounts = accounts
    this.save()
  }

  /**
   * Load the users into memory from storage.
   */
  public async loadFromStore(): Promise<void> {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const rawAccounts: ReadonlyArray<IAccount> = JSON.parse(raw)
    const accountsWithTokens = rawAccounts.map(async account => {
      const accountWithoutToken = new Account(account.login, account.endpoint, '', account.emails, account.avatarURL, account.id, account.name)
      const token = await this.secureStore.getItem(getKeyForAccount(accountWithoutToken), account.login)
      return accountWithoutToken.withToken(token || '')
    })

    this.accounts = await Promise.all(accountsWithTokens)
  }

  private save() {
    const usersWithoutTokens = this.accounts.map(account => account.withToken(''))
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))
  }
}
