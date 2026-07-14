import { Branch } from '../../models/branch'
import { ComputedAction } from '../../models/computed-action'
import { MergeTreeResult } from '../../models/merge'
import { Repository } from '../../models/repository'
import { git, isGitError } from './core'
import { GitError } from 'dugite'

export async function determineMergeability(
  repository: Repository,
  ours: Branch,
  theirs: Branch
) {
  return git(
    [
      'merge-tree',
      '--write-tree',
      '--name-only',
      '--no-messages',
      '-z',
      ours.tip.sha,
      theirs.tip.sha,
    ],
    repository.path,
    'determineMergeability',
    { successExitCodes: new Set([0, 1]) }
  )
    .then<MergeTreeResult>(({ stdout }) => {
      // The output will be "<tree-id>\0[<filename>\0]*" so we can get the
      // number of conflicted files by counting the number of null bytes and
      // subtracting one for the tree id.
      const conflictedFiles = (stdout.match(/\0/g)?.length ?? 0) - 1
      return conflictedFiles > 0
        ? { kind: ComputedAction.Conflicts, conflictedFiles }
        : { kind: ComputedAction.Clean }
    })
    .catch<MergeTreeResult>(e =>
      isGitError(e, GitError.CannotMergeUnrelatedHistories)
        ? Promise.resolve({ kind: ComputedAction.Invalid })
        : Promise.reject(e)
    )
}
