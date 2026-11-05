import { Repository } from '../../../models/repository'

/**
 * Persist the shared manual/assisted push preference.
 *
 * Keep the original key so existing repository opt-ins remain the same setting.
 */
export function storePushAfterCommit(
  repository: Repository,
  enabled: boolean
): void {
  if (repository.id >= 0) {
    localStorage.setItem(
      `assisted-commit-push-${repository.id}`,
      String(enabled)
    )
  }
}

/** Missing, invalid, and unreleased global preferences never enable a push. */
export function getPushAfterCommit(repository: Repository): boolean {
  return (
    repository.id >= 0 &&
    localStorage.getItem(`assisted-commit-push-${repository.id}`) === 'true'
  )
}
