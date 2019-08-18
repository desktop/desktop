import {
  findOrCreateTemporaryWorkTree,
  formatPatch,
  checkPatch,
  getCommitsInRange,
  getMergeBase,
} from '../../git'
import { ComputedAction } from '../../../models/computed-action'
import { Branch } from '../../../models/branch'
import { Repository } from '../../../models/repository'
import { RebasePreview, RebaseLoading } from '../../../models/rebase'

/**
 * Constructs a generator to determine whether a rebase is valid and will encounter conflicts.
 *
 * Will `yield loadingStatus` between every git operation until the final result.
 *
 * No outside input is accepted (via the `yield` mechanism) into this generator as it runs.
 *
 * May throw (unexpected) errors, so be ready to `catch` them!
 *
 * @returns a generator you can iterate to get the final answer
 */
export async function* makeRebasePreviewer({
  repository,
  baseBranch,
  targetBranch,
}: {
  repository: Repository
  baseBranch: Branch
  targetBranch: Branch
}): AsyncIterableIterator<RebasePreview> {
  /** Status for "still loading" */
  const loadingStatus: RebaseLoading = {
    kind: ComputedAction.Loading,
    baseBranch,
  }

  yield loadingStatus

  try {
    const [commits, base] = await Promise.all([
      getCommitsInRange(repository, baseBranch.tip.sha, targetBranch.tip.sha),
      // TODO: in what situations might this not be possible to compute?
      getMergeBase(repository, baseBranch.tip.sha, targetBranch.tip.sha),
    ])

    // if we are unable to find any commits to rebase, indicate that we're
    // unable to proceed with the rebase
    if (commits === null) {
      yield {
        kind: ComputedAction.Invalid,
        baseBranch,
      }
      return
    }

    // the target branch is a direct descendant of the base branch
    // which means the target branch is already up to date and the commits
    // do not need to be applied
    if (base === baseBranch.tip.sha) {
      yield {
        kind: ComputedAction.Clean,
        baseBranch,
        commits: [],
      }
      return
    }

    yield loadingStatus

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
          baseBranch,
          commits,
        }
      : {
          kind: ComputedAction.Conflicts,
          baseBranch,
          commits,
        }

    yield rebasePreview
  } catch (e) {
    log.error(
      `rebasePreviewer errored (with ${e}) and returning "RebaseNotSupported".`
    )
    yield {
      kind: ComputedAction.Invalid,
      baseBranch,
    }
  }
}
