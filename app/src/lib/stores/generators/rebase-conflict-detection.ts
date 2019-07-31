import {
  findOrCreateTemporaryWorkTree,
  formatPatch,
  checkPatch,
} from '../../git'
import { ComputedAction } from '../../../models/computed-action'
import { Branch } from '../../../models/branch'
import { Repository } from '../../../models/repository'
import { CommitOneLine } from '../../../models/commit'

const loadingStatus = {
  kind: ComputedAction.Loading,
}

export async function* checkPotentialRebase({
  repository,
  baseBranch,
  targetBranch,
  commits,
}: {
  repository: Repository
  baseBranch: Branch
  targetBranch: Branch
  commits: ReadonlyArray<CommitOneLine>
}) {
  const worktree = await findOrCreateTemporaryWorkTree(
    repository,
    baseBranch.tip.sha
  )

  yield loadingStatus

  const patch = await formatPatch(
    repository,
    baseBranch.tip.sha,
    targetBranch.tip.sha
  )

  yield loadingStatus

  const rebasePreview = (await checkPatch(worktree, patch))
    ? {
        kind: ComputedAction.Clean,
        commits,
      }
    : {
        kind: ComputedAction.Conflicts,
      }

  yield rebasePreview
}
