import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

export interface IMentionableUser {
  /**
   * The username or "handle" of the user.
   */
  readonly login: string

  /**
   * The real name (or at least the name that the user
   * has configured to be shown) for this user.
   */
  readonly name: string

  /**
   * The user's attributable email address. If the
   * user doesn't have a public profile email address
   * this will instead contain an automatically generated
   * stealth email address based on the account endpoint
   * and login.
   */
  readonly email: string

  /**
   * A url to an avatar image chosen by the user
   */
  readonly avatarURL: string
}

interface IDBMentionableUser extends IMentionableUser {
  readonly gitHubRepositoryID: number
}

export interface IMentionableCacheEntry {
  readonly gitHubRepositoryID: number
  readonly lastUpdated: number
  readonly eTag: string | undefined
}

export class GitHubUserDatabase extends BaseDatabase {
  public mentionables!: Dexie.Table<IDBMentionableUser, number>
  public mentionableCache!: Dexie.Table<IMentionableCacheEntry, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      users: '++id, &[endpoint+email]',
    })

    this.conditionalVersion(2, {
      users: '++id, [endpoint+email], [endpoint+login]',
      mentionables: '++id, repositoryID, &[userID+repositoryID]',
    })

    // Remove the mentionables table in order to recreate it in
    // version 4 using a new primary key. Also remove the obsolete
    // users table
    this.conditionalVersion(3, {
      mentionables: null,
      users: null,
    })

    this.conditionalVersion(4, {
      mentionables: '&[gitHubRepositoryID+login], gitHubRepositoryID',
    })

    this.conditionalVersion(5, {
      mentionableCache: 'gitHubRepositoryID',
    })
  }

  public updateMentionablesForRepository(
    gitHubRepositoryID: number,
    mentionables: ReadonlyArray<IMentionableUser>,
    eTag: string | undefined
  ) {
    return this.transaction(
      'rw',
      this.mentionables,
      this.mentionableCache,
      async () => {
        await this.mentionables
          .where('gitHubRepositoryID')
          .equals(gitHubRepositoryID)
          .delete()

        await this.touchMentionableCacheEntry(gitHubRepositoryID, eTag)
        await this.mentionables.bulkAdd(
          mentionables.map(x => ({ ...x, gitHubRepositoryID }))
        )
      }
    )
  }

  public getAllMentionablesForRepository(
    gitHubRepositoryID: number
  ): Promise<ReadonlyArray<IMentionableUser>> {
    return this.transaction('rw', this.mentionables, async () => {
      const mentionables = await this.mentionables
        .where('gitHubRepositoryID')
        .equals(gitHubRepositoryID)
        .toArray()

      return mentionables.map(mentionable => {
        // Exclude the githubRepositoryID prop
        const { login, email, avatarURL, name } = mentionable
        return { login, email, avatarURL, name }
      })
    })
  }

  public getMentionableCacheEntry(gitHubRepositoryID: number) {
    return this.mentionableCache.get(gitHubRepositoryID)
  }

  private touchMentionableCacheEntry(
    gitHubRepositoryID: number,
    eTag: string | undefined
  ) {
    const lastUpdated = Date.now()
    const entry = { gitHubRepositoryID, lastUpdated, eTag }

    return this.mentionableCache.put(entry)
  }
}
