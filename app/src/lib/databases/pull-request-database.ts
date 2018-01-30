import Dexie from 'dexie'
import { APIRefState, IAPIRefStatusItem } from '../api'

export interface IPullRequestRef {
  /**
   * The database ID of the GitHub repository in which this ref lives. It could
   * be null if the repository was deleted on the site after the PR was opened.
   */
  readonly repositoryDbId: number | null

  /** The name of the ref. */
  readonly ref: string

  /** The SHA of the ref. */
  readonly sha: string
}

export interface IPullRequest {
  /**
   * The database ID. This will be undefined if the pull request hasn't been
   * inserted into the DB.
   */
  readonly id?: number

  /** The GitHub PR number. */
  readonly number: number

  /** The title. */
  readonly title: string

  /** The string formatted date on which the PR was created. */
  readonly createdAt: string

  /** The ref from which the pull request's changes are coming. */
  readonly head: IPullRequestRef

  /** The ref which the pull request is targetting. */
  readonly base: IPullRequestRef

  /** The login of the author. */
  readonly author: string
}

export interface IPullRequestStatus {
  /**
   * The database ID. This will be undefined if the status hasn't been inserted
   * into the DB.
   */
  readonly id?: number

  /** The ID of the pull request in the database. */
  readonly pullRequestId: number

  /** The status' state. */
  readonly state: APIRefState

  /** The number of statuses represented in this combined status. */
  readonly totalCount: number

  /** The SHA for which this status applies. */
  readonly sha: string

  /**
   * The list of statuses for this specific ref or undefined
   * if the database object was created prior to status support
   * being added in #3588
   */
  readonly statuses: ReadonlyArray<IAPIRefStatusItem> | undefined
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

    this.version(3).stores({
      pullRequestStatus: 'id++, &[sha+pullRequestId], pullRequestId',
    })

    this.version(4).stores({
      pullRequests: 'id++, base.repositoryDbId',
    })
  }
}
