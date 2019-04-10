import Dexie from 'dexie'
import { BaseDatabase } from './base-database'

export interface IPullRequestRef {
  /**
   * The database ID of the GitHub repository in which this ref lives. It could
   * be null if the repository was deleted on the site after the PR was opened.
   */
  readonly repoId: number | null

  /** The name of the ref. */
  readonly ref: string

  /** The SHA of the ref. */
  readonly sha: string
}

export interface IBasePullRequestRef extends IPullRequestRef {
  /**
   * The database ID of the GitHub repository in which this ref lives.
   */
  readonly repoId: number
}

export interface IPullRequest {
  /** The GitHub PR number. */
  readonly number: number

  /** The title. */
  readonly title: string

  /** The string formatted date on which the PR was created. */
  readonly createdAt: string

  /** The string formatted date on which the PR was created. */
  readonly updatedAt: string

  /** The ref from which the pull request's changes are coming. */
  readonly head: IPullRequestRef

  /** The ref which the pull request is targetting. */
  readonly base: IBasePullRequestRef

  /** The login of the author. */
  readonly author: string
}

export class PullRequestDatabase extends BaseDatabase {
  public pullRequests!: Dexie.Table<IPullRequest, number>

  public constructor(name: string, schemaVersion?: number) {
    super(name, schemaVersion)

    this.conditionalVersion(1, {
      pullRequests: 'id++, base.repoId',
    })

    this.conditionalVersion(2, {
      pullRequestStatus: 'id++, &[sha+pullRequestId]',
    })

    this.conditionalVersion(3, {
      pullRequestStatus: 'id++, &[sha+pullRequestId], pullRequestId',
    })

    // Version 4 added status fields to the pullRequestStatus table
    // which we've removed in version 5 so it makes no sense keeping
    // that upgrade path available and that's why it appears as if
    // we've got a no-change version.
    this.conditionalVersion(4, {})

    // Remove the pullRequestStatus table
    this.conditionalVersion(5, { pullRequestStatus: null })

    // Unfortunately we have to clear the PRs in order to maintain
    // data consistency in the database. The PRs table is only supposed
    // to store 'open' PRs and if we kept the existing PRs (which)
    // don't have an updated_at field around the initial query for
    // max(updated_at) would return null, causing us to fetch all _open_
    // PRs which in turn means we wouldn't be able to detect if we
    // have any PRs in the database that have been closed since the
    // last time we fetched. Not only that, these closed PRs wouldn't
    // be updated to include the updated_at field unless they were actually
    // modified at a later date.
    //
    // TL;DR; This is the safest approach
    //
    // Also adds a unique index to look up a PR in a repository by number
    this.conditionalVersion(
      6,
      {
        pullRequests:
          'id++, base.repoId, [base.repoId+updatedAt], &[base.repoId+number]',
      },
      clearPullRequests
    )
  }
}

function clearPullRequests(transaction: Dexie.Transaction) {
  return transaction.table('pullRequests').clear()
}
