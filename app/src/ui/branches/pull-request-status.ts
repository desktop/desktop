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
