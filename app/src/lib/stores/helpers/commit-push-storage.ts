import { Repository } from '../../../models/repository'

/** Persist the shared manual/assisted push preference. */
export function storePushAfterCommit(
  repository: Repository,
  enabled: boolean
): void {
  if (repository.id >= 0) {
    localStorage.setItem(
      `automatic-commit-push-${repository.id}`,
      String(enabled)
    )
  }
}

/** Missing, invalid, and unreleased global preferences never enable a push. */
export function getPushAfterCommit(repository: Repository): boolean {
  return (
    repository.id >= 0 &&
    localStorage.getItem(`automatic-commit-push-${repository.id}`) === 'true'
  )
}
