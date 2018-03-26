import { PullRequestStatus } from '../../models/pull-request'
import { APIRefState } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'

function toFriendlyText(state: APIRefState): string {
  switch (state) {
    case 'failure':
      return 'failed'
    case 'pending':
    case 'success':
      return state

    default:
      return assertNever(state, `Unknown APIRefState value: ${state}`)
  }
}

/**
 * Convert the Pull Request status to an app-friendly string.
 *
 * If the pull request contains commit statuses, this method will compute
 * the number of successful statuses. Oteherwise, it will fall back
 * to the `state` value reported by the GitHub API.
 */
export function getPRStatusSummary(prStatus: PullRequestStatus): string {
  const statusCount = prStatus.statuses.length || 0

  if (statusCount === 0) {
    return toFriendlyText(prStatus.state)
  } else {
    const successCount = prStatus.statuses.filter(x => x.state === 'success')
      .length

    return `${successCount}/${statusCount} checks OK`
  }
}
