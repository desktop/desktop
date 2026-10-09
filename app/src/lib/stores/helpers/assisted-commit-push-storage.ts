import { Repository } from '../../../models/repository'

/** Persist explicit assisted-push consent for this repository, never for manual commits. */
export function storePushAfterAssistedCommit(
  repository: Repository,
  enabled: boolean
): void {
  localStorage.setItem(`assisted-commit-push-${repository.id}`, String(enabled))
}

/** Missing, invalid, and unreleased global preferences never enable a push. */
export function getPushAfterAssistedCommit(repository: Repository): boolean {
  return (
    localStorage.getItem(`assisted-commit-push-${repository.id}`) === 'true'
  )
}
