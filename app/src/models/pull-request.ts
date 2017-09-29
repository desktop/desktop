import { APIRefState } from '../lib/api'
import { GitHubRepository } from './github-repository'

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

export class PullRequestStatus {
  public readonly state: APIRefState
  public readonly totalCount: number
  public readonly sha: string

  public constructor(state: APIRefState, totalCount: number, sha: string) {
    this.state = state
    this.totalCount = totalCount
    this.sha = sha
  }
}

export class PullRequest {
  public readonly id: number
  public readonly created: Date
  public readonly title: string
  public readonly number: number
  public readonly head: PullRequestRef
  public readonly base: PullRequestRef
  public readonly author: string
  public readonly status: PullRequestStatus | null

  public constructor(
    id: number,
    created: Date,
    status: PullRequestStatus | null,
    title: string,
    number_: number,
    head: PullRequestRef,
    base: PullRequestRef,
    author: string
  ) {
    this.id = id
    this.created = created
    this.status = status
    this.title = title
    this.number = number_
    this.head = head
    this.base = base
    this.author = author
  }
}
