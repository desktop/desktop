import { setStringArray, getStringArray } from '../../local-storage'
import { Repository } from '../../../models/repository'

/**
 * Store in localStorage the tags to push for the given repository
 *
 * @param repository the repository object
 * @param tagsToPush array with the tags to push
 */
export function storeTagsToPush(
  repository: Repository,
  tagsToPush: ReadonlyArray<string>
) {
  if (tagsToPush.length === 0) {
    clearTagsToPush(repository)
  } else {
    setStringArray(getTagsToPushKey(repository), tagsToPush)
  }
}

/**
 * Get from local storage the tags to push for the given repository
 *
 * @param repository the repository object
 */
export function getTagsToPush(repository: Repository) {
  return getStringArray(getTagsToPushKey(repository))
}

/**
 * Clear from local storage the tags to push for the given repository
 *
 * @param repository the repository object
 */
export function clearTagsToPush(repository: Repository) {
  localStorage.removeItem(getTagsToPushKey(repository))
}

function getTagsToPushKey(repository: Repository) {
  return `tags-to-push-${repository.id}`
}
