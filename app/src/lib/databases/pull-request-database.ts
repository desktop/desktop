import Dexie from 'dexie'

export interface IPullRequestRef {
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
  readonly author: string
}

export interface IPullRequestStatus {
  readonly id?: number
  readonly state: string
  readonly totalCount: number
  readonly pullRequestId: number
  readonly sha: string
}

export class PullRequestDatabase extends Dexie {
  public pullRequests: Dexie.Table<IPullRequest, number>
  public pullRequestStatus: Dexie.Table<IPullRequestStatus, number>

  public constructor(name: string) {
    super(name)

    this.version(1).stores({
      pullRequests: 'id++, base.repoId',
    })

    this.version(2).stores({
      pullRequestStatus: 'id++, &[sha+pullRequestId]',
    })
  }
}
