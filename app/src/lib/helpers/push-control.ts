import { IAPIPushControl } from '../api'

/**
 * Determine if branch can be pushed to by user based on results from
 * push_control API.
 *
 *
 * `allow_actor` indicates if user is permitted
 * Always `true` for admins.
 * `true` if `Restrict who can push` is not enabled.
 * `true` if `Restrict who can push` is enabled and user is in list.
 * `false` if `Restrict who can push` is enabled and user is not in list.
 *
 * `required_status_checks` indicates if checks are required for merging
 * Empty array if user is admin and branch is not admin-enforced.
 *
 * `required_approving_review_count` indicates if reviews are required before merging
 * 0 if user is admin and branch is not admin-enforced
 *
 */

export function isBranchPushable(pushControl: IAPIPushControl) {
  const {
    allow_actor,
    required_status_checks,
    required_approving_review_count,
  } = pushControl

  // If user is admin, required status checks and reviews get zeroed out in API response
  // If user is allowed to push based on `Restrict who can push` setting, they must still
  // respect the merge requirements, and can't push if checks or reviews are required for merging
  const noMergeRequirements =
    required_status_checks.length === 0 && required_approving_review_count === 0

  return allow_actor && noMergeRequirements
}
