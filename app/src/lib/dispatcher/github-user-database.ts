import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 2

export interface IGitHubUser {
  readonly id?: number
  readonly endpoint: string
  readonly email: string
  readonly login: string | null
  readonly avatarURL: string
}

export interface IMentionableAssociation {
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
      mentionables: '++, repositoryID',
    })
  }
}
