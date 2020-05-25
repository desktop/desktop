import { APIRefState } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'
import { IRefStatus } from '../../lib/stores/commit-status-store'

function formatState(state: APIRefState): string {
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

function formatSingleStatus(status: IRefStatus) {
  const word = status.state
  const sentenceCaseWord =
    word.charAt(0).toUpperCase() + word.substring(1, word.length)

  let description
  if (status.statuses.total_count > 0) {
    description = status.statuses.statuses[0].description
  } else {
    description = status.checkRuns.check_runs[0].name
  }

  return `${sentenceCaseWord}: ${description}`
}

/**
 * Convert the Pull Request status to an app-friendly string.
 *
 * If the pull request contains commit statuses, this method will compute
 * the number of successful statuses. Oteherwise, it will fall back
 * to the `state` value reported by the GitHub API.
 */
export function getRefStatusSummary(prStatus: IRefStatus): string {
  const statusCount = prStatus.totalCount

  if (statusCount === 0) {
    return formatState(prStatus.state)
  }

  if (statusCount === 1) {
    return formatSingleStatus(prStatus)
  }

  const successStatusesCount = prStatus.statuses.statuses.filter(
    x => x.state === 'success'
  ).length

  const successChecksCount = prStatus.checkRuns.check_runs.filter(
    x => x.conclusion === 'success'
  ).length

  const successCount = successStatusesCount + successChecksCount

  return `${successCount}/${statusCount} checks OK`
}
