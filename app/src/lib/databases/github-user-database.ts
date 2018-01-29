import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 2

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

export interface IMentionableAssociation {
  /**
   * The internal (to desktop) database id for this association
   *  or undefined if not yet inserted into the database.
   */
  readonly id?: number
  readonly userID: number
  readonly repositoryID: number
}

export class GitHubUserDatabase extends Dexie {
  public users: Dexie.Table<IGitHubUser, number>
  public mentionables: Dexie.Table<IMentionableAssociation, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      users: '++id, &[endpoint+email]',
    })

    this.version(DatabaseVersion).stores({
      users: '++id, [endpoint+email], [endpoint+login]',
      mentionables: '++id, repositoryID, &[userID+repositoryID]',
    })
  }
}
