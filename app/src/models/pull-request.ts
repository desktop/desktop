import { APIRefState } from '../lib/api'
import { GitHubRepository } from './github-repository'

export class PullRequestRef {
  /** The name of the ref. */
  public readonly ref: string

  /** The SHA of the ref. */
  public readonly sha: string

  /**
   * The GitHub repository in which this ref lives. It could be null if the
   * repository was deleted after the PR was opened.
   */
  public readonly gitHubRepository: GitHubRepository | null

  public constructor(
    ref: string,
    sha: string,
    gitHubRepository: GitHubRepository | null
  ) {
    this.ref = ref
    this.sha = sha
    this.gitHubRepository = gitHubRepository
  }
}

/** The commit status and metadata for a given ref */
export interface ICommitStatus {
  readonly id: number
  readonly state: APIRefState
  readonly description: string
}

export class PullRequestStatus {
  /** The pull request this status is associated with */
  public readonly pullRequestNumber: number

  /** The status' state. */
  public readonly state: APIRefState

  /** The number of statuses represented in this combined status. */
  public readonly totalCount: number

  /** The SHA for which this status applies. */
  public readonly sha: string

  /** The list of all statuses for a specific ref. */
  public readonly statuses: ReadonlyArray<ICommitStatus>

  public constructor(
    pullRequestNumber: number,
    state: APIRefState,
    totalCount: number,
    sha: string,
    statuses: ReadonlyArray<ICommitStatus>
  ) {
    this.pullRequestNumber = pullRequestNumber
    this.state = state
    this.totalCount = totalCount
    this.sha = sha
    this.statuses = statuses
  }
}

export class PullRequest {
  /** The database ID. */
  public readonly id: number

  /** The date on which the PR was created. */
  public readonly created: Date

  /** The title of the PR. */
  public readonly title: string

  /** The number. */
  public readonly pullRequestNumber: number

  /** The ref from which the pull request's changes are coming. */
  public readonly head: PullRequestRef

  /** The ref which the pull request is targetting. */
  public readonly base: PullRequestRef

  /** The author's login. */
  public readonly author: string

  /**
   * The status of the PR. This will be `null` if we haven't looked up its
   * status yet or if an error occurred while looking it up.
   */
  public readonly status: PullRequestStatus | null

  public constructor(
    id: number,
    created: Date,
    status: PullRequestStatus | null,
    title: string,
    pullRequestNumber: number,
    head: PullRequestRef,
    base: PullRequestRef,
    author: string
  ) {
    this.id = id
    this.created = created
    this.status = status
    this.title = title
    this.pullRequestNumber = pullRequestNumber
    this.head = head
    this.base = base
    this.author = author
  }
}