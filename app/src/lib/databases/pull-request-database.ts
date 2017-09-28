import Dexie from 'dexie'

export interface IPullRequest {
  readonly id?: number
  readonly repoId: number
  readonly number: number
  readonly title: string
  readonly lastUpdate?: string
}

export class PullRequestDatabase extends Dexie {
  public pullRequests: Dexie.Table<IPullRequest, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      pullRequests: 'id++, repo_id',
    })
  }
}
