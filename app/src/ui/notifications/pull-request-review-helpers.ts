import { IAPIPullRequestReview } from '../../lib/api'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { OcticonSymbolType } from '../octicons/octicons.generated'

/** Returns the user-facing verb for a given review's state. */
export function getVerbForPullRequestReview(review: IAPIPullRequestReview) {
  switch (review.state) {
    case 'APPROVED':
      return 'approved'
    case 'CHANGES_REQUESTED':
      return 'requested changes on'
    default:
      return 'reviewed'
  }
}

type ReviewStateIcon = {
  symbol: OcticonSymbolType
  className: string
}

/** Returns the icon info (symbol and class) for a given review's state. */
export function getPullRequestReviewStateIcon<
  T extends IAPIPullRequestReview['state']
>(state: T): ReviewStateIcon {
  switch (state) {
    case 'APPROVED':
      return {
        symbol: OcticonSymbol.checkCircleFill,
        className: 'pr-review-approved',
      }
    case 'CHANGES_REQUESTED':
      return {
        symbol: OcticonSymbol.fileDiff,
        className: 'pr-review-changes-requested',
      }
    default:
      return {
        symbol: OcticonSymbol.eye,
        className: 'pr-review-commented',
      }
  }
}
