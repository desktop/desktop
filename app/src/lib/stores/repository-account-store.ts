import { Repository } from '../../models/repository'
import { Account } from '../../models/account'

const StorageKey = 'repository-account-preferences'

interface IRepositoryAccountPreference {
  readonly repositoryId: number
  readonly accountLogin: string
}

/**
 * A simple store to manage the preferred account for each repository.
 * This persists to localStorage.
 */
export class RepositoryAccountStore {
  private preferences: Map<number, string>

  public constructor() {
    this.preferences = new Map<number, string>()
    this.load()
  }

  /**
   * Get the preferred account login for the given repository.
   */
  public getPreferredAccountLogin(repository: Repository): string | null {
    return this.preferences.get(repository.id) || null
  }

  /**
   * Set the preferred account for the given repository.
   */
  public setPreferredAccount(repository: Repository, account: Account) {
    this.preferences.set(repository.id, account.login)
    this.save()
  }

  private load() {
    try {
      const raw = localStorage.getItem(StorageKey)
      if (!raw) {
        return
      }

      const parsed: ReadonlyArray<IRepositoryAccountPreference> = JSON.parse(raw)
      for (const pref of parsed) {
        this.preferences.set(pref.repositoryId, pref.accountLogin)
      }
    } catch (e) {
      console.error('Failed to load repository account preferences', e)
    }
  }

  private save() {
    try {
      const serialized = Array.from(this.preferences.entries()).map(
        ([repositoryId, accountLogin]) => ({
          repositoryId,
          accountLogin,
        })
      )
      localStorage.setItem(StorageKey, JSON.stringify(serialized))
    } catch (e) {
      console.error('Failed to save repository account preferences', e)
    }
  }
}

// Export a singleton instance
export const repositoryAccountStore = new RepositoryAccountStore()
