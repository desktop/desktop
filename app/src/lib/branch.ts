import { Branch, BranchType } from '../models/branch'
import { UpstreamRemoteName } from './stores'

/**
 * Finds the remote branch for a branch in the upstream repository
 *
 * For example:
 * If official/funnel has the branch `development`, then running
 * this on the branches from the fork outofambit/funnel with
 * `development` as the specified branch name will find the
 * branch `remotes/upstream/development`
 *
 * @param branchName short name of the branch in the upstream repo
 * @param branches all the branches in the local repo
 */
export function findUpstreamRemoteBranch(
  branchName: string,
  branches: ReadonlyArray<Branch>
) {
  return branches.find(
    b =>
      b.type === BranchType.Remote &&
      b.name === `${UpstreamRemoteName}/${branchName}`
  )
}
