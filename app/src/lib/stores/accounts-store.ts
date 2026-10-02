import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount, getKeyForEndpoint } from '../auth'
import { Account, accountEquals, isDotComAccount } from '../../models/account'
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
  private knownAccounts: ReadonlyArray<Account> = []

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

  /** Get the identities of signed-in and previously signed-in accounts. */
  public async getKnownAccounts(): Promise<ReadonlyArray<Account>> {
    await this.loadingPromise
    return this.knownAccounts.slice()
  }

  /**
   * Add the account to the store.
   */
  public async addAccount(account: Account): Promise<Account | null> {
    await this.loadingPromise
    const previous = this.accounts.find(x => accountEquals(x, account))

    try {
      const key = getKeyForAccount(account)
      await this.secureStore.setItem(key, account.login, account.token)
      if (previous !== undefined && previous.login !== account.login) {
        await this.secureStore.deleteItem(
          getKeyForAccount(previous),
          previous.login
        )
      }
    } catch (e) {
      log.error(`Error adding account '${account.login}'`, e)

      if (__DARWIN__ && isKeyChainError(e)) {
        this.emitError(
          new Error(
            `GitHub Desktop was unable to store the account token in the keychain. Please check you have unlocked access to the 'login' keychain.`
          )
        )
      } else {
        this.emitError(e)
      }
      return null
    }

    this.accounts = sortAccounts([
      ...this.accounts.filter(x => !accountEquals(x, account)),
      account,
    ])
    this.knownAccounts = sortAccounts([
      ...this.knownAccounts.filter(x => !accountEquals(x, account)),
      account.withToken(''),
    ])

    this.save()
    return account
  }

  /** Refresh all accounts by fetching their latest info from the API. */
  public async refresh(): Promise<void> {
    const refreshed = await Promise.all(
      this.accounts.map(async previous => {
        const updated = await this.tryUpdateAccount(previous)
        if (!accountEquals(previous, updated)) {
          this.emitError(
            new Error(
              `Account identity changed during refresh for ${previous.login}`
            )
          )
          return previous
        }
        if (previous.login !== updated.login) {
          try {
            await this.secureStore.setItem(
              getKeyForAccount(updated),
              updated.login,
              updated.token
            )
            await this.secureStore.deleteItem(
              getKeyForAccount(previous),
              previous.login
            )
          } catch (error) {
            this.emitError(error)
            return previous
          }
        }
        return updated
      })
    )
    this.accounts = sortAccounts(refreshed)
    this.knownAccounts = sortAccounts([
      ...this.knownAccounts.filter(
        known => !refreshed.some(account => accountEquals(known, account))
      ),
      ...refreshed.map(account => account.withToken('')),
    ])
    this.save()
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

    this.accounts = this.accounts.filter(a => !accountEquals(a, account))

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
   */
  private async loadFromStore(): Promise<void> {
    const raw = this.dataStore.getItem('users')
    const parsedAccounts: ReadonlyArray<IAccount> = raw ? JSON.parse(raw) : []
    const migratedAccounts = this.getMigratedGHEAccounts(parsedAccounts)
    const rawAccounts = migratedAccounts ?? parsedAccounts
    const knownRaw = this.dataStore.getItem('known-users')
    const knownAccounts: ReadonlyArray<IAccount> = knownRaw
      ? JSON.parse(knownRaw)
      : rawAccounts
    const migratedKnownAccounts = this.getMigratedGHEAccounts(knownAccounts)
    this.knownAccounts = sortAccounts(
      (migratedKnownAccounts ?? knownAccounts).map(
        account =>
          new Account(
            account.login,
            account.endpoint,
            '',
            account.emails,
            account.avatarURL,
            account.id,
            account.name,
            account.plan
          )
      )
    )

    const accountsWithTokens = []
    for (const [index, account] of rawAccounts.entries()) {
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
        if (!token) {
          const oldEndpoints = new Set([
            account.endpoint,
            parsedAccounts[index].endpoint,
          ])
          for (const oldEndpoint of oldEndpoints) {
            const oldKey = getKeyForEndpoint(oldEndpoint)
            token = await this.secureStore.getItem(oldKey, account.login)
            if (token) {
              await this.secureStore.setItem(key, account.login, token)
              await this.secureStore.deleteItem(oldKey, account.login)
              break
            }
          }
        }
        if (token) {
          accountsWithTokens.push(accountWithoutToken.withToken(token))
        }
      } catch (e) {
        log.error(`Error getting token for '${key}'. Skipping.`, e)

        this.emitError(e)
      }
    }

    this.accounts = sortAccounts(accountsWithTokens)
    // If any account was migrated, make sure to persist the new value
    if (
      migratedAccounts !== null ||
      migratedKnownAccounts !== null ||
      rawAccounts.length !== accountsWithTokens.length
    ) {
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
    this.dataStore.setItem('known-users', JSON.stringify(this.knownAccounts))

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
