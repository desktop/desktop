import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../lib/dispatcher'

/**
 * Determine the octicon to display for a given repository.
 */
export function iconForRepository(repository: Repository | CloningRepository) {
  if (repository instanceof CloningRepository) {
    return OcticonSymbol.desktopDownload
  }

  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) { return OcticonSymbol.deviceDesktop }

  if (gitHubRepo.private) { return OcticonSymbol.lock }
  if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

  return OcticonSymbol.repo
}
