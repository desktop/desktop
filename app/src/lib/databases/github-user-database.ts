import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

export interface IGitHubUser {
  /**
   * The internal (to desktop) database id for this user or undefined
   * if not yet inserted into the database.
   */
  readonly id?: number
  readonly endpoint: string
  readonly email: string
  readonly login: string
  readonly avatarURL: string

  /**
   * The user's real name or null if the user hasn't provided a real
   * name yet.
   */
  readonly name: string | null
}

export interface IMentionableUser {
  readonly gitHubRepositoryID: number
  readonly login: string
  readonly name: string
  readonly email: string
  readonly avatarURL: string
}

export class GitHubUserDatabase extends BaseDatabase {
  public users!: Dexie.Table<IGitHubUser, number>
  public mentionables!: Dexie.Table<IMentionableUser, number>

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
    // version 4 using a new primary key.
    this.conditionalVersion(3, {
      mentionables: null,
    })

    this.conditionalVersion(4, {
      mentionables: '&[gitHubRepositoryID+login], gitHubRepositoryID',
    })
  }

  public updateMentionablesForRepository(
    gitHubRepositoryID: number,
    mentionables: IMentionableUser[]
  ) {
    return this.transaction('rw', this.mentionables, async () => {
      await this.mentionables
        .where('gitHubRepositoryID')
        .equals(gitHubRepositoryID)
        .delete()

      await this.mentionables.bulkAdd(mentionables)
    })
  }

  public getAllMentionablesForRepository(gitHubRepositoryID: number) {
    return this.transaction('rw', this.mentionables, async () => {
      return await this.mentionables
        .where('gitHubRepositoryID')
        .equals(gitHubRepositoryID)
        .toArray()
    })
  }
}
