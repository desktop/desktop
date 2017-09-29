import { IAPIPullRequest, IAPIRefStatus } from '../lib/api'

/** A pull request as used in the UI. */
export interface IPullRequest extends IAPIPullRequest {
  readonly status: IAPIRefStatus
  readonly created: Date
}

export class PullRequest {
  public readonly created: Date
  public readonly status: IAPIRefStatus
  public readonly title: string
  public readonly number: number

  public constructor(
    created: Date,
    status: IAPIRefStatus,
    title: string,
    number_: number
  ) {
    this.created = created
    this.status = status
    this.title = title
    this.number = number_
  }
}
