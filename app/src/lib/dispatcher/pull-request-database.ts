import Dexie from 'dexie'

const DatabaseVersion = 2

export interface IPullRequest {}

export class PullRequestDatabase {
  public pullRequests: Dexie.Table<IPullRequest, number>

  public constructor(name: string) {
    super(name)

    this.version(DatabaseVersion).stores({
      pullRequests: '++id, &[]',
    })
  }
}
