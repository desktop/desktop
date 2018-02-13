import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

/** The combined state of a ref. */
export type RefState = 'failure' | 'pending' | 'success'

export interface IPullRequestRef {
  /**
   * The database ID of the GitHub repository in which this ref lives. It could
   * be null if the repository was deleted on the site after the PR was opened.
   */
  readonly repository_id: number | null

  /** The name of the ref. */
  readonly ref: string

  /** The SHA of the ref. */
  readonly sha: string
}

export interface ICombinedRefStatus {
  readonly id: number
  /** The state of the status. */
  readonly state: RefState
  /** The target URL to associate with this status. */
  readonly target_url: string
  /** A short description of the status. */
  readonly description: string
  /** A string label to differentiate this status from the status of other systems. */
  readonly context: string
}

export interface IPullRequest {
  /**
   * The database ID. This will be undefined if the pull request hasn't been
   * inserted into the DB.
   */
  readonly _id?: number

  /** The GitHub PR number. */
  readonly number: number

  /** The title. */
  readonly title: string

  /** The string formatted date on which the PR was created. */
  readonly created_at: string

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
  readonly _id?: number

  /** The ID of the pull request in the database. */
  readonly pull_request_id: number

  /** The status' state. */
  readonly state: APIRefState

  /** The number of statuses represented in this combined status. */
  readonly total_count: number

  /** The SHA for which this status applies. */
  readonly sha: string

  /**
   * The list of statuses for this specific ref or undefined
   * if the database object was created prior to status support
   * being added in #3588
   */
  readonly status: ReadonlyArray<IAPIRefStatusItem>
}

export class PullRequestDatabase extends BaseDatabase {
  public pullRequest: Dexie.Table<IPullRequest, number>
  public pullRequestStatus: Dexie.Table<IPullRequestStatus, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      pullRequests: 'id++, base.repoId',
    })

    this.conditionalVersion(2, {
      pullRequestStatuses: 'id++, &[sha+pullRequestId]',
    })

    this.conditionalVersion(3, {
      pullRequestStatuses: 'id++, &[sha+pullRequestId], pullRequestId',
    })

    // we need to run the upgrade function to ensure we add
    // a status field to all previous records
    this.conditionalVersion(4, {}, this.addStatusesField)

    this.conditionalVersion(
      5,
      {
        pullRequest: '_id++, base.repository_id',
        pullRequestStatus: '_id++, pull_request_id, &[sha+pull_request_id]',
      },
      this.upgradeFieldNames
    )
  }

  private addStatusesField = async (transaction: Dexie.Transaction) => {
    const table = this.pullRequestStatus

    await table.toCollection().modify(async prStatus => {
      if (prStatus.status == null) {
        const newPrStatus = { statuses: [], ...prStatus }

        await table
          .where('[sha+pullRequestId]')
          .equals([prStatus.sha, prStatus.pull_request_id])
          .delete()

        await table.add(newPrStatus)
      }
    })
  }

  private upgradeFieldNames = async (transaction: Dexie.Transaction) => {
    const oldPRRecords = await transaction
      .table('pullRequests')
      .toCollection()
      .toArray()
    const newPRRecords: IPullRequest[] = oldPRRecords.map(r => {
      return {
        _id: r.id as number,
        number: r.number as number,
        title: r.title as string,
        created_at: r.createdAt as string,
        head: {
          repository_id: r.head.repoId,
          ref: r.head.ref as string,
          sha: r.head.sha as string,
        },
        base: {
          repository_id: r.base.repoId,
          ref: r.base.ref as string,
          sha: r.base.sha as string,
        },
        author: r.author,
      }
    })
    await transaction
      .table('pullRequests')
      .toCollection()
      .delete()
    await this.pullRequest.bulkAdd(newPRRecords)

    const oldPrStatusRecords = await transaction
      .table('pullRequestStatuses')
      .toCollection()
      .toArray()
    const newPrStatusRecords: IPullRequestStatus[] = oldPrStatusRecords.map(
      r => {
        return {
          _id: r.id as number,
          pull_request_id: r.pullRequestId as number,
          state: r.state as APIRefState,
          total_count: r.totalCount as number,
          sha: r.sha as string,
          status: r.statuses as IAPIRefStatusItem[],
        }
      }
    )
    await transaction
      .table('pullRequestStatuses')
      .toCollection()
      .delete()
    this.pullRequestStatus.bulkAdd(newPrStatusRecords)
  }
}
