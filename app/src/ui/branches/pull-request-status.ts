import { PullRequestStatus } from '../../models/pull-request'

export function getSummary(prStatus: PullRequestStatus): string {
  const statusCount = prStatus.statuses.length || 0

  if (statusCount === 0) {
    return prStatus.state.toUpperCase()
  } else {
    const successCount = prStatus.statuses.filter(x => x.state === 'success')
      .length

    return `${successCount}/${statusCount} checks OK`
  }
}
