import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'
import * as OcticonSymbol from '@githubprimer/octicons-react'

/**
 * Determine the octicon to display for a given repository.
 */
export function iconForRepository(
  repository: Repository | CloningRepository
): OcticonSymbol.Icon {
  if (repository instanceof CloningRepository) {
    return OcticonSymbol.DesktopDownload
  }

  if (repository.missing) {
    return OcticonSymbol.Alert
  }

  const gitHubRepo = repository.gitHubRepository
  if (!gitHubRepo) {
    return OcticonSymbol.DeviceDesktop
  }

  if (gitHubRepo.private) {
    return OcticonSymbol.Lock
  }
  if (gitHubRepo.fork) {
    return OcticonSymbol.RepoForked
  }

  return OcticonSymbol.Repo
}
