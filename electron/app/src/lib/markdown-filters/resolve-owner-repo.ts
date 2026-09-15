import { GitHubRepository } from '../../models/github-repository'

/**
 * The ownerOrOwnerRepo may be of the from owner or owner/repo.
 * 1) If owner/repo and they don't both match the current repo, then we return
 *    them as to distinguish them as a different from the current repo for the
 *    reference url.
 * 2) If (owner) and the owner !== current repo owner, it is an invalid
 *    references - return null.
 * 3) Otherwise, return [] as it is an valid references, but, was either and
 *    empty string or in the current repo and is redundant owner/repo info.
 */
export function resolveOwnerRepo(
  ownerOrOwnerRepo: string | undefined,
  repository: GitHubRepository
): ReadonlyArray<string> | null {
  if (ownerOrOwnerRepo === undefined) {
    return []
  }

  const ownerAndRepo = ownerOrOwnerRepo.split('/')
  // Invalid - This shouldn't happen based on the regex, but would mean
  // something/something/something/#1 which isn't an commit ref.
  if (ownerAndRepo.length > 3) {
    return null
  }

  // Invalid - If it is only something@1234567 and that `something` isn't the
  // current repositories owner login, then it is not an actual, 'relative to
  // this user', commit ref.
  if (ownerAndRepo.length === 1 && ownerAndRepo[0] !== repository.owner.login) {
    return null
  }

  // If owner and repo are provided, we only care if they differ from the current repo.
  if (
    ownerAndRepo.length === 2 &&
    (ownerAndRepo[0] !== repository.owner.login ||
      ownerAndRepo[1] !== repository.name)
  ) {
    return ownerAndRepo
  }

  return []
}
