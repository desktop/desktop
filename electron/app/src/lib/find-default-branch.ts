import { Branch, BranchType } from '../models/branch'
import {
  Repository,
  isForkedRepositoryContributingToParent,
} from '../models/repository'
import { getRemoteHEAD } from './git'
import { getDefaultBranch } from './helpers/default-branch'
import { UpstreamRemoteName } from './stores/helpers/find-upstream-remote'

/**
 * Attempts to locate the default branch as determined by the HEAD symbolic link
 * in the contribution target remote (origin or upstream) if such a ref exists,
 * falling back to the value of the `init.defaultBranch` configuration and
 * finally a const value of `main`.
 *
 * In determining the default branch we prioritize finding a local branch but if
 * no local branch matches the default branch name nor is tracking the
 * contribution target remote HEAD we'll fall back to looking for the remote
 * branch itself.
 */
export async function findDefaultBranch(
  repository: Repository,
  branches: ReadonlyArray<Branch>,
  defaultRemoteName: string | undefined
) {
  const remoteName = isForkedRepositoryContributingToParent(repository)
    ? UpstreamRemoteName
    : defaultRemoteName

  const remoteHead = remoteName
    ? await getRemoteHEAD(repository, remoteName)
    : null

  const defaultBranchName = remoteHead ?? (await getDefaultBranch())
  const remoteRef = remoteHead ? `${remoteName}/${remoteHead}` : undefined

  let localHit: Branch | undefined = undefined
  let localTrackingHit: Branch | undefined = undefined
  let remoteHit: Branch | undefined = undefined

  for (const branch of branches) {
    if (branch.type === BranchType.Local) {
      if (branch.name === defaultBranchName) {
        localHit = branch
      }

      if (remoteRef && branch.upstream === remoteRef) {
        // Give preference to local branches that target the upstream
        // default branch that also match the name. In other words, if there
        // are two local branches which both track the origin default branch
        // we'll prefer a branch which is also named the same as the default
        // branch name.
        if (!localTrackingHit || branch.name === defaultBranchName) {
          localTrackingHit = branch
        }
      }
    } else if (remoteRef && branch.name === remoteRef) {
      remoteHit = branch
    }
  }

  // When determining what the default branch is we give priority to local
  // branches tracking the default branch of the contribution target (think
  // origin) remote, then we consider local branches that are named the same
  // as the default branch, and finally we look for the remote branch
  // representing the default branch of the contribution target
  return localTrackingHit ?? localHit ?? remoteHit ?? null
}
