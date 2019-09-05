import {
  findOrCreateTemporaryWorkTree,
  formatPatch,
  checkPatch,
  getCommitsInRange,
  getMergeBase,
  revSymmetricDifference,
  getAheadBehind,
} from '../../git'
import { ComputedAction } from '../../../models/computed-action'
import { Branch } from '../../../models/branch'
import { Repository } from '../../../models/repository'
import { MergeLoading, MergePreview } from '../../../models/merge'

/**
 * Constructs a generator to determine whether a merge is valid and will encounter conflicts.
 *
 * Will `yield loadingStatus` between every git operation until the final result.
 *
 * No outside input is accepted (via the `yield` mechanism) into this generator as it runs.
 *
 * @returns a generator you can iterate to get the final answer
 */
export async function* makeMergePreviewer({
  repository,
  baseBranch,
  headBranch,
}: {
  repository: Repository
  baseBranch: Branch
  headBranch: Branch
}): AsyncIterableIterator<MergePreview> {
  /** Status for "still loading" */
  const loadingStatus: MergeLoading = {
    kind: ComputedAction.Loading,
    headBranch,
  }

  yield loadingStatus

  try {
    // get mergeBase
    const mergeBase = await getMergeBase(
      repository,
      baseBranch.tip.sha,
      headBranch.tip.sha
    )
    if (mergeBase === null) {
      yield { kind: ComputedAction.Invalid, headBranch }
      return
    }
    // get work tree
    const worktree = await findOrCreateTemporaryWorkTree(
      repository,
      baseBranch.tip.sha
    )

    yield loadingStatus
    // try merge in worktree
    const patch = await formatPatch(
      repository,
      baseBranch.tip.sha,
      headBranch.tip.sha
    )

    yield loadingStatus
    // get more info
    const range = revSymmetricDifference('', headBranch.name)
    const aheadBehind = await getAheadBehind(repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0
    // make merge preview object

    // yield mergePreview
  } catch (e) {
    log.error(
      `rebasePreviewer errored (with ${e}) and returning "RebaseNotSupported".`
    )
    yield {
      kind: ComputedAction.Invalid,
      headBranch,
    }
  }
}
