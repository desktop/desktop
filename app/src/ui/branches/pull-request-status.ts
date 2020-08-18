import { assertNever } from '../../lib/fatal-error'
import {
  ICombinedRefStatus,
  RefCheckState,
} from '../../lib/stores/commit-status-store'

function formatState(state: RefCheckState): string {
  switch (state) {
    case 'failure':
      return 'Commit status: failed'
    case 'pending':
    case 'success':
      return `Commit status: ${state}`

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
export function getRefStatusSummary(prStatus: ICombinedRefStatus): string {
  if (prStatus.checks.length === 0) {
    return formatState(prStatus.state)
  }

  if (prStatus.checks.length === 1) {
    const { name, description } = prStatus.checks[0]
    return `${name}: ${description}`
  }

  let successCount = 0

  for (const check of prStatus.checks) {
    if (check.state === 'success') {
      successCount++
    }
  }

  return `${successCount}/${prStatus.checks.length} checks OK`
}
