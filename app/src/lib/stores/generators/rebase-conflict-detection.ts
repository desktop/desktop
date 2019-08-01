import {
  findOrCreateTemporaryWorkTree,
  formatPatch,
  checkPatch,
  getCommitsInRange,
} from '../../git'
import { ComputedAction } from '../../../models/computed-action'
import { Branch } from '../../../models/branch'
import { Repository } from '../../../models/repository'
import { RebasePreview, RebaseLoading } from '../../../models/rebase'

const loadingStatus: RebaseLoading = {
  kind: ComputedAction.Loading,
}

export async function* checkPotentialRebase({
  repository,
  baseBranch,
  targetBranch,
}: {
  repository: Repository
  baseBranch: Branch
  targetBranch: Branch
}): AsyncIterableIterator<RebasePreview> {
  const commits =
    (await getCommitsInRange(
      repository,
      baseBranch.tip.sha,
      targetBranch.tip.sha
    )) || []

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

  const rebasePreview: RebasePreview = (await checkPatch(worktree, patch))
    ? {
        kind: ComputedAction.Clean,
        commits,
      }
    : {
        kind: ComputedAction.Conflicts,
      }

  yield rebasePreview
}
