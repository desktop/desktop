import { IDataStore, ISecureStore } from './stores'
import { getKeyForAccount } from '../auth'
import {
  Account,
  accountEquals,
  getAccountMetadata,
  IAccountIdentity,
  IAccountMetadata,
  isDotComAccount,
} from '../../models/account'
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

/** Return the first (active) account for each endpoint. */
const getActiveAccounts = (accounts: ReadonlyArray<Account>) => {
  const endpoints = new Set<string>()

  return accounts.filter(account => {
    if (endpoints.has(account.endpoint)) {
      return false
    }

    endpoints.add(account.endpoint)
    return true
  })
}

/** Move an account to the active position for its endpoint. */
const moveAccountToActivePosition = (
  accounts: ReadonlyArray<Account>,
  account: Account
) => {
  const withoutAccount = accounts.filter(
    existingAccount => !accountEquals(existingAccount, account)
  )
  const endpointIndex = withoutAccount.findIndex(
    existingAccount => existingAccount.endpoint === account.endpoint
  )

  if (endpointIndex !== -1) {
    return [
      ...withoutAccount.slice(0, endpointIndex),
      account,
      ...withoutAccount.slice(endpointIndex),
    ]
  }

  if (isDotComAccount(account)) {
    const enterpriseIndex = withoutAccount.findIndex(
      existingAccount => !isDotComAccount(existingAccount)
    )

    if (enterpriseIndex !== -1) {
      return [
        ...withoutAccount.slice(0, enterpriseIndex),
        account,
        ...withoutAccount.slice(enterpriseIndex),
      ]
    }
  }

  return [...withoutAccount, account]
}

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

  /** Serializes secure-store and in-memory mutations for one identity. */
  private readonly accountOperations = new Map<string, Promise<void>>()

  /** Serializes mutations which target the same secure-store credential. */
  private readonly credentialOperations = new Map<string, Promise<void>>()

  private readonly accountUpdater: (account: Account) => Promise<Account>

  public constructor(
    dataStore: IDataStore,
    secureStore: ISecureStore,
    accountUpdater: (account: Account) => Promise<Account> = updatedAccount
  ) {
    super()

    this.dataStore = dataStore
    this.secureStore = secureStore
    this.accountUpdater = accountUpdater
    this.loadingPromise = this.loadFromStore()
  }

  /**
   * Get the active account for each endpoint.
   *
   * Consumers performing API or Git operations must use this method so that
   * only one credential is selected for each GitHub host.
   */
  public async getAll(): Promise<ReadonlyArray<Account>> {
    await this.loadingPromise

    return getActiveAccounts(this.accounts)
  }

  /** Get all stored accounts, including inactive accounts. */
  public async getAllAccounts(): Promise<ReadonlyArray<IAccountMetadata>> {
    await this.loadingPromise

    return this.accounts.map(getAccountMetadata)
  }

  /** Register a function called whenever the stored account list changes. */
  public onDidUpdateAllAccounts(
    fn: (accounts: ReadonlyArray<IAccountMetadata>) => void
  ) {
    return this.emitter.on('did-update-all-accounts', fn)
  }

  /**
   * Add the account to the store.
   */
  public async addAccount(account: Account): Promise<Account | null> {
    await this.loadingPromise

    return this.withAccountOperation(account, async () => {
      const previousAccount = this.accounts.find(existingAccount =>
        accountEquals(existingAccount, account)
      )

      const credentialLogins =
        previousAccount === undefined
          ? [account.login]
          : [account.login, previousAccount.login]

      return this.withCredentialOperations(
        account.endpoint,
        credentialLogins,
        async () => {
          const credentialOwner = this.accounts.find(
            existingAccount =>
              existingAccount.endpoint === account.endpoint &&
              existingAccount.login === account.login &&
              !accountEquals(existingAccount, account)
          )

          if (credentialOwner !== undefined) {
            const error = new Error(
              `GitHub Desktop already has another '${account.login}' account for this host. Sign out of that account before adding this one.`
            )
            log.error(
              `Refusing to overwrite credential for account '${credentialOwner.id}' with account '${account.id}'`,
              error
            )
            this.emitError(error)
            return null
          }

          try {
            const key = getKeyForAccount(account)
            await this.secureStore.setItem(key, account.login, account.token)
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

          // Secure-store entries are keyed by endpoint and login while account
          // identity is endpoint and user id. If the user renamed their login,
          // remove the credential stored under the old login after the
          // replacement credential has been written successfully.
          if (
            previousAccount !== undefined &&
            previousAccount.login !== account.login
          ) {
            try {
              await this.secureStore.deleteItem(
                getKeyForAccount(previousAccount),
                previousAccount.login
              )
            } catch (e) {
              log.error(
                `Error removing credential for renamed account '${previousAccount.login}'`,
                e
              )
              this.emitError(e)
            }
          }

          this.accounts = moveAccountToActivePosition(this.accounts, account)

          this.save()
          return account
        }
      )
    })
  }

  /** Make an existing account active for its endpoint. */
  public async setActiveAccount(
    account: IAccountIdentity
  ): Promise<Account | null> {
    await this.loadingPromise

    const storedAccount = this.accounts.find(existingAccount =>
      accountEquals(existingAccount, account)
    )

    if (storedAccount === undefined) {
      return null
    }

    this.accounts = moveAccountToActivePosition(this.accounts, storedAccount)
    this.save()
    return storedAccount
  }

  /** Refresh all accounts by fetching their latest info from the API. */
  public async refresh(): Promise<void> {
    await this.loadingPromise

    const accountsAtStart = this.accounts.slice()
    const refreshedAccounts = await Promise.all(
      accountsAtStart.map(acc => this.tryUpdateAccount(acc))
    )

    // Account refreshes may overlap a switch, sign-in, reauthentication, or
    // sign-out. Merge refreshed profile information into the current list so
    // the completed request can't restore stale ordering, tokens, or accounts.
    this.accounts = this.accounts.map(currentAccount => {
      const originalIndex = accountsAtStart.findIndex(account =>
        accountEquals(account, currentAccount)
      )

      if (originalIndex === -1) {
        return currentAccount
      }

      const originalAccount = accountsAtStart[originalIndex]
      return originalAccount.token === currentAccount.token
        ? refreshedAccounts[originalIndex]
        : currentAccount
    })

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
      return await this.accountUpdater(account)
    } catch (e) {
      log.warn(`Error refreshing account '${account.login}'`, e)
      return account
    }
  }

  /**
   * Remove the account from the store.
   */
  public async removeAccount(
    account: IAccountIdentity
  ): Promise<Account | null> {
    await this.loadingPromise

    const storedAccount = this.accounts.find(existingAccount =>
      accountEquals(existingAccount, account)
    )

    if (storedAccount === undefined) {
      return null
    }

    return this.removeStoredAccount(storedAccount)
  }

  /** Remove the stored account owning an invalidated endpoint/token pair. */
  public async removeAccountForToken(
    endpoint: string,
    token: string
  ): Promise<Account | null> {
    await this.loadingPromise

    const storedAccount = this.accounts.find(
      account => account.endpoint === endpoint && account.token === token
    )

    if (storedAccount === undefined) {
      return null
    }

    return this.removeStoredAccount(storedAccount)
  }

  private async removeStoredAccount(account: Account): Promise<Account | null> {
    return this.withAccountOperation(account, async () => {
      return this.withCredentialOperations(
        account.endpoint,
        [account.login],
        async () => {
          const currentAccount = this.accounts.find(
            existingAccount =>
              accountEquals(existingAccount, account) &&
              existingAccount.token === account.token
          )

          if (currentAccount === undefined) {
            return null
          }

          try {
            await this.secureStore.deleteItem(
              getKeyForAccount(currentAccount),
              currentAccount.login
            )
          } catch (e) {
            log.error(`Error removing account '${currentAccount.login}'`, e)
            this.emitError(e)
            return null
          }

          // The operation queues prevent add/remove races for this identity and
          // credential, and this token check protects future mutation paths.
          const accountStillCurrent = this.accounts.some(
            existingAccount =>
              accountEquals(existingAccount, currentAccount) &&
              existingAccount.token === currentAccount.token
          )
          if (!accountStillCurrent) {
            return null
          }

          this.accounts = this.accounts.filter(
            existingAccount => !accountEquals(existingAccount, currentAccount)
          )

          this.save()
          return currentAccount
        }
      )
    })
  }

  private async withCredentialOperations<T>(
    endpoint: string,
    logins: ReadonlyArray<string>,
    operation: () => Promise<T>
  ): Promise<T> {
    const operationKeys = [
      ...new Set(logins.map(login => JSON.stringify([endpoint, login]))),
    ].sort()
    const previousOperations = operationKeys.map(
      key => this.credentialOperations.get(key) ?? Promise.resolve()
    )
    let finishOperation: (() => void) | undefined
    const currentOperation = new Promise<void>(
      resolve => (finishOperation = resolve)
    )

    for (const key of operationKeys) {
      this.credentialOperations.set(key, currentOperation)
    }

    await Promise.all(previousOperations)
    try {
      return await operation()
    } finally {
      finishOperation?.()
      for (const key of operationKeys) {
        if (this.credentialOperations.get(key) === currentOperation) {
          this.credentialOperations.delete(key)
        }
      }
    }
  }

  private async withAccountOperation<T>(
    account: IAccountIdentity,
    operation: () => Promise<T>
  ): Promise<T> {
    const operationKey = `${account.endpoint}:${account.id}`
    const previousOperation =
      this.accountOperations.get(operationKey) ?? Promise.resolve()
    let finishOperation: (() => void) | undefined
    const currentOperation = new Promise<void>(
      resolve => (finishOperation = resolve)
    )
    this.accountOperations.set(operationKey, currentOperation)

    await previousOperation
    try {
      return await operation()
    } finally {
      finishOperation?.()
      if (this.accountOperations.get(operationKey) === currentOperation) {
        this.accountOperations.delete(operationKey)
      }
    }
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
        const token = await this.secureStore.getItem(key, account.login)
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
      this.emitAccountsUpdate()
    }
  }

  private save() {
    const usersWithoutTokens = this.accounts.map(account =>
      account.withToken('')
    )
    this.dataStore.setItem('users', JSON.stringify(usersWithoutTokens))

    this.emitAccountsUpdate()
  }

  private emitAccountsUpdate() {
    this.emitUpdate(getActiveAccounts(this.accounts))
    this.emitter.emit(
      'did-update-all-accounts',
      this.accounts.map(getAccountMetadata)
    )
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
