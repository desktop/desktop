import { Tip, TipState } from '../../../models/tip'
import { IRemote } from '../../../models/remote'
import { GitHubRepository } from '../../../models/github-repository'
import { urlMatchesCloneURL } from '../../repository-matching'
import { Branch, BranchType } from '../../../models/branch'

/**
 * Function to determine which branch name to use when looking for branch
 * protection information.
 *
 * If the remote branch matches the current `githubRepository` associated with
 * the repository, this will be used. Otherwise we will fall back to using the
 * branch name as that's a reasonable approximation for what would happen if the
 * user tries to push the new branch.
 */
export function findRemoteBranchName(
  tip: Tip,
  remote: IRemote | null,
  gitHubRepository: GitHubRepository
): string | null {
  if (tip.kind !== TipState.Valid) {
    return null
  }

  if (
    tip.branch.upstreamWithoutRemote !== null &&
    remote !== null &&
    urlMatchesCloneURL(remote.url, gitHubRepository)
  ) {
    return tip.branch.upstreamWithoutRemote
  }

  return tip.branch.nameWithoutRemote
}

/**
 * Attempts to find a local branch which is set up to track the given branch
 * on the given remote. If that fails attempts to locate the remote branch
 * itself.
 *
 * @param remote      The remote where the upstream branch resides
 * @param branchName  The name of the upstream branch (i.e. `feature-a`)
 */
export function findTrackingOrRemoteBranch(
  branches: ReadonlyArray<Branch>,
  remote: IRemote,
  branchName: string
) {
  const ref = `${remote.name}/${branchName}`

  return (
    branches.find(x => x.type === BranchType.Local && x.upstream === ref) ??
    branches.find(x => x.type === BranchType.Remote && x.name === branchName)
  )
}
