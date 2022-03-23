import {
  ValidNotificationPullRequestReview,
  ValidNotificationPullRequestReviewState,
} from '../../lib/valid-notification-pull-request-review'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { OcticonSymbolType } from '../octicons/octicons.generated'

/** Returns the user-facing verb for a given review's state. */
export function getVerbForPullRequestReview(
  review: ValidNotificationPullRequestReview
) {
  switch (review.state) {
    case 'APPROVED':
      return 'approved'
    case 'CHANGES_REQUESTED':
      return 'requested changes on'
    case 'COMMENTED':
      return 'reviewed'
  }
}

type ReviewStateIcon = {
  symbol: OcticonSymbolType
  className: string
}

/** Returns the icon info (symbol and class) for a given review's state. */
export function getPullRequestReviewStateIcon(
  state: ValidNotificationPullRequestReviewState
): ReviewStateIcon {
  switch (state) {
    case 'APPROVED':
      return {
        symbol: OcticonSymbol.check,
        className: 'pr-review-approved',
      }
    case 'CHANGES_REQUESTED':
      return {
        symbol: OcticonSymbol.fileDiff,
        className: 'pr-review-changes-requested',
      }
    case 'COMMENTED':
      return {
        symbol: OcticonSymbol.eye,
        className: 'pr-review-commented',
      }
  }
}
