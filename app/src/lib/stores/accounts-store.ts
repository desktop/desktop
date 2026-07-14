import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount, getLegacyKeyForEndpoint } from '../auth'
import { Account, isDotComAccount } from '../../models/account'
import { fetchUser, EmailVisibility, getEnterpriseAPIURL } from '../api'
import { fatalError } from '../fatal-error'
import { TypedBaseStore } from './base-store'
import { isGHE } from '../endpoint-capabilities'
import { compare, compareDescending } from '../compare'

// Ensure that GitHub.com accounts appear first followed by Enterprise
// accounts, sorted by the order in which they were added.
const sortAccounts = (accounts: ReadonlyArray<Account>) =>
  accounts
    .map((account, ix) => [account, ix] as const)
    .sort(
      ([xAccount, xIx], [yAccount, yIx]) =>
        compareDescending(
          isDotComAccount(xAccount),
          isDotComAccount(yAccount)
        ) || compare(xIx, yIx)
    )
    .map(([account]) => account)

/** The data-only interface for storage. */
interface IEmail {
  readonly email: string
  /**
   * Represents whether GitHub has confirmed the user has access to this
   * email address. New users require a verified email address before
   * they can sign into GitHub Desktop.
   */
  readonly verified: boolean
  /**
   * Flag for the user's preferred email address. Other email addresses
   * are provided for associating commit authors with the one GitHub account.
   */
  readonly primary: boolean

  /** The way in which the email is visible. */
  readonly visibility: EmailVisibility
}

function isKeyChainError(e: any) {
  const error = e as Error
  return (
    error.message &&
    error.message.startsWith(
      'The user name or passphrase you entered is not correct'
    )
  )
}

/** The data-only interface for storage. */
interface IAccount {
  readonly token: string
  readonly login: string
  readonly endpoint: string
  readonly emails: ReadonlyArray<IEmail>
  readonly avatarURL: string
  readonly id: number
  readonly name: string
  readonly plan?: string
}

/** The store for logged in accounts. */
export class AccountsStore extends TypedBaseStore<ReadonlyArray<Account>> {
  private dataStore: IDataStore
  private secureStore: ISecureStore

  private accounts: ReadonlyArray<Account> = []

  /** A promise that will resolve when the accounts have been loaded. */
  private loadingPromise: Promise<void>

  public constructor(dataStore: IDataStore, secureStore: ISecureStore) {
    super()

    this.dataStore = dataStore
    this.secureStore = secureStore
    this.loadingPromise = this.loadFromStore()
  }

  /**
   * Get the list of accounts in the cache.
   */
  public async getAll(): Promise<ReadonlyArray<Account>> {
    await this.loadingPromise

    return this.accounts.slice()
  }

  /**
   * Add the account to the store.
   *
   * Unlike the original implementation, this supports multiple accounts
   * for the same endpoint (e.g. multiple GitHub.com accounts). If an
   * account with the same (endpoint, id) already exists it will be
   * replaced; otherwise the new account is appended.
   */
  public async addAccount(account: Account): Promise<Account | null> {
    await this.loadingPromise

    try {
      const key = getKeyForAccount(account)
      await this.secureStore.setItem(key, account.login, account.token)
    } catch (e) {
      log.error(`Error adding account '${account.login}'`, e)

      if (__DARWIN__ && isKeyChainError(e)) {
        this.emitError(
          new Error(
            `GITmaxed was unable to store the account token in the keychain. Please check you have unlocked access to the 'login' keychain.`
          )
        )
      } else {
        this.emitError(e)
      }
      return null
    }

    // Replace existing account with the same (endpoint, id), otherwise append
    const existingIndex = this.accounts.findIndex(
      a => a.endpoint === account.endpoint && a.id === account.id
    )
    if (existingIndex >= 0) {
      const updated = [...this.accounts]
      updated[existingIndex] = account
      this.accounts = sortAccounts(updated)
    } else {
      this.accounts = sortAccounts([...this.accounts, account])
    }

    this.save()
    return account
  }

  /** Refresh all accounts by fetching their latest info from the API. */
  public async refresh(): Promise<void> {
    this.accounts = await Promise.all(
      this.accounts.map(acc => this.tryUpdateAccount(acc))
    )

    this.save()
    this.emitUpdate(this.accounts)
  }

  /**
   * Attempts to update the Account with new information from
   * the API.
   *
   * If the update fails for whatever reason this function
   * will return the old Account instance. Usually updates fails
   * due to connectivity issues but in the future we should
   * investigate whether we're able to detect here that the
   * token is definitely not valid anymore and let the
   * user know that they've been signed out.
   */
  private async tryUpdateAccount(account: Account): Promise<Account> {
    try {
      return await updatedAccount(account)
    } catch (e) {
      log.warn(`Error refreshing account '${account.login}'`, e)
      return account
    }
  }

  /**
   * Remove the account from the store.
   */
  public async removeAccount(account: Account): Promise<void> {
    await this.loadingPromise

    try {
      await this.secureStore.deleteItem(
        getKeyForAccount(account),
        account.login
      )
    } catch (e) {
      log.error(`Error removing account '${account.login}'`, e)
      this.emitError(e)
      return
    }

    this.accounts = this.accounts.filter(
      a => !(a.endpoint === account.endpoint && a.id === account.id)
    )

    this.save()
  }

  private getMigratedGHEAccounts(
    accounts: ReadonlyArray<IAccount>
  ): ReadonlyArray<IAccount> | null {
    let migrated = false
    const migratedAccounts = accounts.map(account => {
      let endpoint = account.endpoint
      const endpointURL = new URL(endpoint)
      // Migrate endpoints of subdomains of `.ghe.com` that use the `/api/v3`
      // path to the correct URL using the `api.` subdomain.
      if (isGHE(endpoint) && !endpointURL.hostname.startsWith('api.')) {
        endpoint = getEnterpriseAPIURL(endpoint)
        migrated = true
      }

      return {
        ...account,
        endpoint,
      }
    })

    return migrated ? migratedAccounts : null
  }

  /**
   * Load the users into memory from storage.
   *
   * Handles migration from the old single-token-per-endpoint storage
   * (legacy key: "GitHub - {endpoint}") to the new per-login storage
   * (key: "GitHub - {endpoint}/{login}").
   */
  private async loadFromStore(): Promise<void> {
    const raw = this.dataStore.getItem('users')
    if (!raw || !raw.length) {
      return
    }

    const parsedAccounts: ReadonlyArray<IAccount> = JSON.parse(raw)
    const migratedAccounts = this.getMigratedGHEAccounts(parsedAccounts)
    const rawAccounts = migratedAccounts ?? parsedAccounts

    const accountsWithTokens = []
    for (const account of rawAccounts) {
      const accountWithoutToken = new Account(
        account.login,
        account.endpoint,
        '',
        account.emails,
        account.avatarURL,
        account.id,
        account.name,
        account.plan
      )

      const key = getKeyForAccount(accountWithoutToken)
      try {
        let token = await this.secureStore.getItem(key, account.login)

        // Migration: try the legacy endpoint-only key if the new key has no token
        if (!token) {
          const legacyKey = getLegacyKeyForEndpoint(account.endpoint)
          token = await this.secureStore.getItem(legacyKey, account.login)

          if (token) {
            log.info(
              `Migrating token for '${account.login}' from legacy key to per-login key`
            )
            // Migrate: store under new key and remove legacy key
            await this.secureStore.setItem(key, account.login, token)
            // Only delete legacy key if the login matches (old storage used endpoint-only key)
            // We can't know the old login, but the legacy key's service name is the same
          }
        }

        accountsWithTokens.push(accountWithoutToken.withToken(token || ''))
      } catch (e) {
        log.error(`Error getting token for '${key}'. Skipping.`, e)

        this.emitError(e)
      }
    }

    this.accounts = sortAccounts(accountsWithTokens)
    // If any account was migrated, make sure to persist the new value
    if (migratedAccounts !== null) {
      this.save() // Save already emits an update
    } else {
      this.emitUpdate(this.accounts)
    }
  }

  private save() {
    const usersWithoutTokens = this.accounts.map(account =>
      account.withToken('')
    )
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))

    this.emitUpdate(this.accounts)
  }
}

async function updatedAccount(account: Account): Promise<Account> {
  if (!account.token) {
    return fatalError(
      `Cannot update an account which doesn't have a token: ${account.login}`
    )
  }

  return fetchUser(account.endpoint, account.token)
}
