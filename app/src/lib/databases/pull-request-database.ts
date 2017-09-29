import Dexie from 'dexie'

interface IPullRequestRef {
  readonly repoId: number
  readonly ref: string
  readonly sha: string
}

export interface IPullRequest {
  readonly id?: number
  readonly number: number
  readonly title: string
  readonly createdAt: string
  readonly head: IPullRequestRef
  readonly base: IPullRequestRef
}

export class PullRequestDatabase extends Dexie {
  public pullRequests: Dexie.Table<IPullRequest, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      pullRequests: 'id++, base.repoId',
    })
  }
}
