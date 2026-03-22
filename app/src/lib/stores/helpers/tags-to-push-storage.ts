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

export function storeTagsToDeleteOnRemote(
  repository: Repository,
  tagsToDeleteOnRemote: ReadonlyArray<string>
) {
  if (tagsToDeleteOnRemote.length === 0) {
    clearTagsToDeleteOnRemote(repository)
  } else {
    setStringArray(getTagsToDeleteOnRemoteKey(repository), tagsToDeleteOnRemote)
  }
}

export function getTagsToDeleteOnRemote(repository: Repository) {
  return getStringArray(getTagsToDeleteOnRemoteKey(repository))
}

export function clearTagsToDeleteOnRemote(repository: Repository) {
  localStorage.removeItem(getTagsToDeleteOnRemoteKey(repository))
}

function getTagsToPushKey(repository: Repository) {
  return `tags-to-push-${repository.id}`
}

function getTagsToDeleteOnRemoteKey(repository: Repository) {
  return `tags-to-delete-on-remote-${repository.id}`
}
