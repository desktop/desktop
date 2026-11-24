import { CommitMode } from '../../../models/commit-mode'
import { Repository } from '../../../models/repository'

/** Store the commit mode for this repository, independently of other repos. */
export function storeCommitMode(repository: Repository, mode: CommitMode) {
  localStorage.setItem(getCommitModeKey(repository), mode)
}

/** Restore the repository's commit mode, defaulting to manual for unknown values. */
export function getCommitMode(repository: Repository): CommitMode {
  return localStorage.getItem(getCommitModeKey(repository)) === 'copilot'
    ? 'copilot'
    : 'manual'
}

function getCommitModeKey(repository: Repository) {
  return `commit-mode-${repository.id}`
}
