interface IChecksFailedNotificationUserInfo {
  readonly type: 'pr-checks-failed'
  readonly owner: string
  readonly repo: string
  readonly pullRequestNumber: number
  readonly checkSuiteId: number
  readonly commitSha: string
}

interface IPullRequestReviewSubmitNotificationUserInfo {
  readonly type: 'pr-review-submit'
  readonly owner: string
  readonly repo: string
  readonly pullRequestNumber: number
  readonly reviewId: string
}

export type NotificationUserInfo =
  | IChecksFailedNotificationUserInfo
  | IPullRequestReviewSubmitNotificationUserInfo
