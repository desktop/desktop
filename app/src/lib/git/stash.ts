import { git } from './core'
import { Repository } from '../../models/repository'

export interface IStashEntry {
  /** The name of the branch at the time the entry was created. */
  readonly branchName: string

  /** The SHA of the commit object created as a result of stashing. */
  readonly stashSha: string
}

/**
 * Applies the stash entry identified by matching `stashSha` to its commit hash.
 *
 * To see the commit hash of stash entry, run
 * `git log -g refs/stash --pretty="%nentry: %gd%nsubject: %gs%nhash: %H%n"`
 * in a repo with some stash entries.
 */
export async function applyStashEntry(
  repository: Repository,
  stashSha: string
): Promise<void> {
  const result = await git(
    ['stash', 'apply', `${stashSha}`],
    repository.path,
    'applyStashEntry',
    {
      successExitCodes: new Set([0, 1, 128]),
    }
  )
}
