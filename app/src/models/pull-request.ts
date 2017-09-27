import { IAPIPullRequest, APIRefState } from '../lib/api'

/** A pull request as used in the UI. */
export interface IPullRequest extends IAPIPullRequest {
  readonly state: APIRefState
  readonly created: Date
}
