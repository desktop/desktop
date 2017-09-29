import { IAPIPullRequest, IAPIRefStatus } from '../lib/api'
import { IPullRequestRef } from '../lib/databases'

/** A pull request as used in the UI. */
export interface IPullRequest extends IAPIPullRequest {
  readonly status: IAPIRefStatus
  readonly created: Date
}

export class PullRequest {
  public readonly created: Date
  public readonly status: IAPIRefStatus | null
  public readonly title: string
  public readonly number: number
  public readonly head: IPullRequestRef
  public readonly base: IPullRequestRef

  public constructor(
    created: Date,
    status: IAPIRefStatus | null,
    title: string,
    number_: number,
    head: IPullRequestRef,
    base: IPullRequestRef
  ) {
    this.created = created
    this.status = status
    this.title = title
    this.number = number_
    this.head = head
    this.base = base
  }
}
