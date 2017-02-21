import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../lib/dispatcher'

export function iconForRepository(repository: Repository | CloningRepository) {
  if (repository instanceof CloningRepository) {
    return OcticonSymbol.desktopDownload
  } else {
    const gitHubRepo = repository.gitHubRepository
    if (!gitHubRepo) { return OcticonSymbol.repo }

    if (gitHubRepo.private) { return OcticonSymbol.lock }
    if (gitHubRepo.fork) { return OcticonSymbol.repoForked }

    return OcticonSymbol.repo
  }
}
