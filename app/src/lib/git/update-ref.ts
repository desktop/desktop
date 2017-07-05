import { git } from './core'
import { Repository } from '../../models/repository'

/**
 * Update the ref to a new value.
 *
 * @param repository - The repository in which the ref exists.
 * @param ref        - The ref to update. Must be fully qualified
 *                     (e.g., `refs/heads/NAME`).
 * @param oldValue   - The value we expect the ref to have currently. If it
 *                     doesn't match, the update will be aborted.
 * @param newValue   - The new value for the ref.
 * @param reason     - The reflog entry.
 */
export async function updateRef(
  repository: Repository,
  ref: string,
  oldValue: string,
  newValue: string,
  reason: string
): Promise<void> {
  await git(
    ['update-ref', ref, newValue, oldValue, '-m', reason],
    repository.path,
    'updateRef'
  )
}

/**
 * Remove a ref.
 *
 * @param repository - The repository in which the ref exists.
 * @param ref        - The ref to remove. Should be fully qualified, but may also be 'HEAD'.
 * @param reason     - The reflog entry.
 */
export async function deleteRef(
  repository: Repository,
  ref: string,
  reason: string
): Promise<true | undefined> {
  const result = await git(
    ['update-ref', '-m', reason, '-d', ref],
    repository.path,
    'deleteRef'
  )

  if (result.exitCode === 0) {
    return true
  }

  return undefined
}
