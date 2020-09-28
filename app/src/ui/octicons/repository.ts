import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

/**
 * Determine the octicon to display for a given repository.
 */
export function iconForRepository(repository: Repository | CloningRepository) {
  if (repository instanceof CloningRepository) {
    return OcticonSymbol.desktopDownload
  }

  if (repository.missing) {
    return OcticonSymbol.alert
  }

  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) {
    return OcticonSymbol.deviceDesktop
  }

  if (gitHubRepo.isPrivate) {
    return OcticonSymbol.lock
  }
  if (gitHubRepo.fork) {
    return OcticonSymbol.repoForked
  }

  return OcticonSymbol.repo
}
