import * as octicons from '../octicons/octicons.generated'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

/**
 * Determine the octicon to display for a given repository.
 */
export function iconForRepository(repository: Repository | CloningRepository) {
  if (repository instanceof CloningRepository) {
    return octicons.desktopDownload
  }

  if (repository.missing) {
    return octicons.alert
  }

  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) {
    return octicons.deviceDesktop
  }

  if (gitHubRepo.isPrivate) {
    return octicons.lock
  }
  if (gitHubRepo.fork) {
    return octicons.repoForked
  }

  return octicons.repo
}
