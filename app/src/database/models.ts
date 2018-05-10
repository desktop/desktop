export type CIStatus = 'failure' | 'pending' | 'success'

export interface IRepository {
  readonly kind: 'repository'
  readonly name: string
  readonly path: string
  readonly isMissing: boolean
  readonly ghRepository?: IGHRepository
}

export interface IGHRepository {
  readonly kind: 'gh-repository'
  readonly name: string
  readonly defaultBranch: string
  readonly isPrivate: boolean
  readonly cloneUrl: string
  readonly htmlUrl: string | null
  readonly issues: ReadonlyArray<IIssue>
  readonly owner: IUser
  readonly parent: IGHRepository | null
  readonly mentionables: ReadonlyArray<IUser>
  readonly pullRequests: ReadonlyArray<IPullRequest>
}

export interface IIssue {
  readonly number: number
  readonly title: string
  readonly updatedAt: Date
}

export interface IUser {
  readonly name: string | null
  readonly login: string //key
  readonly email: string | null
  readonly endpoint: string //key
  readonly avatarUrl: string
}

export interface IPullRequestStatus {
  /** The ID of the pull request in the database. */
  readonly pullRequestId: number

  /** The status' state. */
  readonly state: CIStatus

  /** The number of statuses represented in this combined status. */
  readonly totalCount: number

  /** The SHA for which this status applies. */
  readonly sha: string

  /**
   * The list of statuses for this specific ref or undefined
   * if the database object was created prior to status support
   * being added in #3588
   */
  readonly statuses?: ReadonlyArray<IPullRequestStatusItem>
}

export interface IPullRequest {
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

export interface IPullRequestRef {
  /** The name of the ref. */
  readonly ref: string

  /** The SHA of the ref. */
  readonly sha: string
}

export interface IPullRequestStatusItem {
  readonly state: CIStatus
  readonly targetUrl: string
  readonly description: string
  readonly context: string
}
