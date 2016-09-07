import Dexie from 'dexie'

// NB: This _must_ be incremented whenever the DB key scheme changes.
const DatabaseVersion = 1

export interface IGitHubUser {
  readonly id?: number
  readonly endpoint: string
  readonly email: string
  readonly login: string | null
  readonly avatarURL: string
}

export class GitHubUserDatabase extends Dexie {
  public users: Dexie.Table<IGitHubUser, number>

  public constructor(name: string) {
    super(name)

    this.version(DatabaseVersion).stores({
      users: '++id, &[endpoint+email]',
    })
  }
}
