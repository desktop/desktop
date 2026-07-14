import { IAPIPullRequestReview } from './api'

export type ValidNotificationPullRequestReviewState =
  | 'APPROVED'
  | 'CHANGES_REQUESTED'
  | 'COMMENTED'

export type ValidNotificationPullRequestReview = IAPIPullRequestReview & {
  state: ValidNotificationPullRequestReviewState
}

/**
 * Returns whether or not the given review is valid from a notifications point
 * of view: in order to get a notification from a review, it must be approved,
 * changes requested, or commented.
 */
export function isValidNotificationPullRequestReview(
  review: IAPIPullRequestReview
): review is ValidNotificationPullRequestReview {
  return (
    review.state === 'APPROVED' ||
    review.state === 'CHANGES_REQUESTED' ||
    review.state === 'COMMENTED'
  )
}
