import { IAPIPullRequest, IAPIRefStatus } from '../lib/api'
import { GitHubRepository } from './github-repository'

/** A pull request as used in the UI. */
export interface IPullRequest extends IAPIPullRequest {
  readonly status: IAPIRefStatus
  readonly created: Date
}

export class PullRequestRef {
  public readonly ref: string
  public readonly sha: string
  public readonly gitHubRepository: GitHubRepository

  public constructor(
    ref: string,
    sha: string,
    gitHubRepository: GitHubRepository
  ) {
    this.ref = ref
    this.sha = sha
    this.gitHubRepository = gitHubRepository
  }
}

export class PullRequest {
  public readonly created: Date
  public readonly status: IAPIRefStatus
  public readonly title: string
  public readonly number: number
  public readonly head: PullRequestRef
  public readonly base: PullRequestRef
  public readonly author: string

  public constructor(
    created: Date,
    status: IAPIRefStatus,
    title: string,
    number_: number,
    head: PullRequestRef,
    base: PullRequestRef,
    author: string
  ) {
    this.created = created
    this.status = status
    this.title = title
    this.number = number_
    this.head = head
    this.base = base
    this.author = author
  }
}
