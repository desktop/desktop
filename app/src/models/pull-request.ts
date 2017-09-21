import { IAPIPullRequest, APIRefState } from '../lib/api'

export interface IPullRequest extends IAPIPullRequest {
  readonly state: APIRefState
  readonly created: Date
}
