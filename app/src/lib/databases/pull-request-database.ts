import Dexie from 'dexie'
import { BaseDatabase } from './base-database'
import { GitHubRepository } from '../../models/github-repository'
import { fatalError } from '../fatal-error'

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

type PullRequestKey = [number, number]

export class PullRequestDatabase extends BaseDatabase {
  public pullRequests!: Dexie.Table<IPullRequest, PullRequestKey>

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

    // Delete pullRequestsTable in order to recreate it again
    // in version 7 with a new primary key
    this.conditionalVersion(6, { pullRequests: null })

    // new primary key and a new index for updatedAt
    this.conditionalVersion(7, {
      pullRequests:
        '[base.repoId+number], base.repoId, [base.repoId+updatedAt]',
    })
  }

  /**
   * Removes all the given pull requests from the database.
   */
  public async deletePullRequests(prs: IPullRequest[]) {
    // I believe this to be a bug in Dexie's type declarations.
    // It defeinitely supports passing an array of keys but the
    // type thinks that if it's an array it should be an array
    // of void which I believe to be a mistake. Therefore we
    // first ensure that the array is what _we_ expect it to
    // be (i.e. PullRequestKey[]) before typing it as any and
    // handing it off to Dexie.
    const ids = (<PullRequestKey[]>(
      prs.map(pr => [pr.base.repoId, pr.number])
    )) as any

    return this.pullRequests.bulkDelete(ids)
  }

  /**
   * Inserts the given pull requests, overwriting any existing records
   * in the process.
   */
  public putPullRequests(prs: IPullRequest[]) {
    return this.pullRequests.bulkPut(prs)
  }

  /**
   * Retrieve all PRs for the given repository.
   *
   * Note: This method will throw if the GitHubRepository hasn't
   * yet been inserted into the databas (i.e the dbID field is null).
   */
  public getAllPullRequestsInRepository(repository: GitHubRepository) {
    if (repository.dbID === null) {
      return fatalError("Can't retrieve PRs for repository, no dbId")
    }

    return this.pullRequests
      .where('[base.repoId+number]')
      .between([repository.dbID], [repository.dbID + 1])
      .toArray()
  }
}
