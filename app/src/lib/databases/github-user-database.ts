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
  readonly login: string
  readonly name: string
  readonly email: string
  readonly avatarURL: string
}

interface IDBMentionableUser extends IMentionableUser {
  readonly gitHubRepositoryID: number
}

export class GitHubUserDatabase extends BaseDatabase {
  public users!: Dexie.Table<IGitHubUser, number>
  public mentionables!: Dexie.Table<IDBMentionableUser, number>

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
    mentionables: ReadonlyArray<IMentionableUser>
  ) {
    return this.transaction('rw', this.mentionables, async () => {
      await this.mentionables
        .where('gitHubRepositoryID')
        .equals(gitHubRepositoryID)
        .delete()

      await this.mentionables.bulkAdd(
        mentionables.map(x => ({ ...x, gitHubRepositoryID }))
      )
    })
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
}
