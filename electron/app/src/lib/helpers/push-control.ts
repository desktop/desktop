import { IAPIPushControl } from '../api'

/**
 * Determine if branch can be pushed to by user based on results from
 * push_control API.
 *
 * Note: "admin-enforced" means that admins are restricted according to branch
 * protection rules. By default admins are not restricted.
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
 */

export function isBranchPushable(pushControl: IAPIPushControl) {
  const {
    allow_actor,
    required_status_checks,
    required_approving_review_count,
  } = pushControl

  // See https://github.com/desktop/desktop/issues/9054#issuecomment-582768322
  // We'll guard against this being undefined until we can determine the
  // root cause and fix that.
  const requiredStatusCheckCount = Array.isArray(required_status_checks)
    ? required_status_checks.length
    : 0

  // If user is admin and branch is not admin-enforced,
  // required status checks and reviews get zeroed out in API response (no merge requirements).
  // If user is admin and branch is admin-enforced,
  // required status checks and reviews do NOT get zeroed out in API response.
  // If user is allowed to push based on `Restrict who can push` setting, they must still
  // respect the merge requirements, and can't push if checks or reviews are required for merging
  const noMergeRequirements =
    requiredStatusCheckCount === 0 && required_approving_review_count === 0

  // We check for !== false so that if a future version of the API decides to
  // remove or rename that property we'll revert to assuming that the user
  // _does_ have access rather than assuming that they _don't_.
  return allow_actor !== false && noMergeRequirements
}
