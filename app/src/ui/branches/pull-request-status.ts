import { ICommitStatus } from '../../models/pull-request'
import { APIRefState, IAPIRefStatus } from '../../lib/api'
import { assertNever } from '../../lib/fatal-error'

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

function formatSingleStatus(status: ICommitStatus) {
  const word = status.state
  const sentenceCaseWord =
    word.charAt(0).toUpperCase() + word.substring(1, word.length)

  return `${sentenceCaseWord}: ${status.description}`
}

/**
 * Convert the Pull Request status to an app-friendly string.
 *
 * If the pull request contains commit statuses, this method will compute
 * the number of successful statuses. Oteherwise, it will fall back
 * to the `state` value reported by the GitHub API.
 */
export function getRefStatusSummary(prStatus: IAPIRefStatus): string {
  const statusCount = prStatus.statuses.length || 0

  if (statusCount === 0) {
    return formatState(prStatus.state)
  }

  if (statusCount === 1) {
    return formatSingleStatus(prStatus.statuses[0])
  }

  const successCount = prStatus.statuses.filter(x => x.state === 'success')
    .length

  return `${successCount}/${statusCount} checks OK`
}
