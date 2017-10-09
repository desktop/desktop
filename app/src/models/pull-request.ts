import { IAPIPullRequest, IAPIRefStatus } from '../lib/api'

/** A pull request as used in the UI. */
export interface IPullRequest extends IAPIPullRequest {
  readonly status: IAPIRefStatus
  readonly created: Date
}
