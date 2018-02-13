import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

export const PullRequestTableName = 'pullRequest'
export const PullRequestStatusTableName = 'pullRequestStatus'

/** The combined state of a ref. */
export type RefState = 'failure' | 'pending' | 'success'

export interface IPullRequestRef {
  /**
   * The database ID of the GitHub repository in which this ref lives. It could
   * be null if the repository was deleted on the site after the PR was opened.
   */
  readonly repositoryId: number | null

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
  readonly targetUrl: string
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
  readonly _id?: number

  /** The ID of the pull request in the database. */
  readonly pullRequestId: number

  /** The status' state. */
  readonly state: RefState

  /** The number of statuses represented in this combined status. */
  readonly totalCount: number

  /** The SHA for which this status applies. */
  readonly sha: string

  /**
   * The list of statuses for this specific ref or undefined
   * if the database object was created prior to status support
   * being added in #3588
   */
  readonly status: ReadonlyArray<ICombinedRefStatus>
}

export class PullRequestDatabase extends BaseDatabase {
  public pullRequest: Dexie.Table<IPullRequest, number>
  public pullRequestStatus: Dexie.Table<IPullRequestStatus, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      pullRequest: 'id++, base.repoId',
    })

    this.conditionalVersion(2, {
      pullRequestStatus: 'id++, &[sha+pullRequestId]',
    })

    this.conditionalVersion(3, {
      pullRequestStatus: 'id++, &[sha+pullRequestId], pullRequestId',
    })

    // we need to run the upgrade function to ensure we add
    // a status field to all previous records
    this.conditionalVersion(4, {}, this.addStatusesField)

    // we need to copy data to tmp tables
    // so we can clear all indexes
    this.conditionalVersion(
      5,
      {
        pullRequestTmp: '_id++, base.repositoryId',
        pullRequestStatusTmp: `_id++`,
      },
      this.moveDataToTmpTables
    )

    this.conditionalVersion(
      6,
      {
        pullRequest: '_id++, base.repositoryId',
        pullRequestStatus: '_id++',
      },
      this.upgradeFieldNames
    )
  }

  private addStatusesField = async (transaction: Dexie.Transaction) => {
    const tableName = 'pullRequestStatus'

    await transaction
      .table(tableName)
      .toCollection()
      .modify(async prStatus => {
        if (prStatus.status == null) {
          const newPrStatus = { statuses: [], ...prStatus }

          await transaction
            .table(tableName)
            .where('[sha+pullRequestId]')
            .equals([prStatus.sha, prStatus.pullRequestId])
            .delete()

          await transaction.table(tableName).add(newPrStatus)
        }
      })
  }

  private moveDataToTmpTables = async (transaction: Dexie.Transaction) => {
    console.log('moveDataToTmpTables...')
    let tmpTable: string

    console.dir(transaction)

    try {
      tmpTable = 'pullRequestTmp'

      const prs = await transaction.table(PullRequestTableName).toArray()
      console.log('mapping PR data')
      const updatedPrs = prs.map(pr => {
        return {
          _id: pr.id as number,
          number: pr.number as number,
          title: pr.title as string,
          createdAt: pr.createdAt as string,
          head: {
            repositoryId: pr.head.repoId,
            ref: pr.head.ref,
            sha: pr.head.sha,
          },
          base: {
            repositoryId: pr.base.repoId,
            ref: pr.base.ref,
            sha: pr.base.sha,
          },
          author: pr.author,
        }
      })
      console.log('adding mapped PR data')
      await transaction.table(tmpTable).bulkAdd(updatedPrs)
      console.log(`removing PR data from '${PullRequestTableName}'`)
      await transaction
        .table(PullRequestTableName)
        .toCollection()
        .delete()
    } catch (error) {
      console.error(`Failed to transfer 'pullRequest' data: ${error}`)
      throw error
    }

    try {
      tmpTable = 'pullRequestStatusTmp'

      const prStats = await transaction
        .table(PullRequestStatusTableName)
        .toArray()
      console.log('mapping PR Status data')
      const updatedPrStats = prStats.map(prStat => {
        return {
          _id: prStat.id as number,
          pullRequestId: prStat.pullRequestId as number,
          state: prStat.state as RefState,
          totalCount: prStat.totalCount,
          sha: prStat.sha,
          status: prStat.map((s: any) => {
            return {
              id: s.id as number,
              state: s.state as RefState,
              targetUrl: s.target_url as string,
              description: s.description as string,
              context: s.context as string,
            }
          }),
        }
      })
      console.log('adding mapped PR Status data')
      await transaction.table(tmpTable).bulkAdd(updatedPrStats)
      console.log(
        `removing PR Status data from '${PullRequestStatusTableName}'`
      )
      await transaction
        .table(PullRequestStatusTableName)
        .toCollection()
        .delete()
    } catch (error) {
      console.error(`Failed to transfer 'pullRequestStatus' data: ${error}`)
      throw error
    }
    console.log('completed')
  }

  private upgradeFieldNames = async (transaction: Dexie.Transaction) => {
    console.log('upgradeFieldNames...')
    try {
      const oldPRRecords = await transaction.table('pullRequests').toArray()
      const newPRRecords: IPullRequest[] = oldPRRecords.map(r => {
        return {
          _id: r.id as number,
          number: r.number as number,
          title: r.title as string,
          createdAt: r.createdAt as string,
          head: {
            repositoryId: r.head.repoId as number,
            ref: r.head.ref as string,
            sha: r.head.sha as string,
          },
          base: {
            repositoryId: r.base.repoId as number,
            ref: r.base.ref as string,
            sha: r.base.sha as string,
          },
          author: r.author,
        }
      })

      console.log(`deleting old indexes on '${PullRequestTableName}'`)
      await Promise.all(
        ['id', 'base.repoId'].map(index =>
          transaction.idbtrans
            .objectStore(PullRequestTableName)
            .deleteIndex(index)
        )
      )
      console.log(`clearing table '${PullRequestTableName}'`)
      await transaction.table(PullRequestTableName).clear()
      await this.pullRequest.bulkAdd(newPRRecords)
    } catch (error) {
      log.error(
        `Failed to upgrade field names on 'pullRequest' table: ${error}`
      )
      throw error
    }

    try {
      const oldPrStatusRecords = await transaction
        .table('pullRequestStatus')
        .toCollection()
        .toArray()
      const newPrStatusRecords: IPullRequestStatus[] = oldPrStatusRecords.map(
        r => {
          return {
            _id: r.id as number,
            pullRequestId: r.pullRequestId as number,
            state: r.state as RefState,
            totalCount: r.totalCount as number,
            sha: r.sha as string,
            status: r.statuses as Array<ICombinedRefStatus>,
          }
        }
      )
      await transaction
        .table('pullRequestStatus')
        .toCollection()
        .delete()
      this.pullRequestStatus.bulkAdd(newPrStatusRecords)
    } catch (error) {
      log.error(
        `Failed to upgrade field names on 'pullRequestStatus' table: ${error}`
      )
      throw error
    }
    console.log('completed')
  }
}
