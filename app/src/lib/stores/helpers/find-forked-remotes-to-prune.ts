import { Branch } from '../../../models/branch'
import { PullRequest } from '../../../models/pull-request'
import { ForkedRemotePrefix, IRemote } from '../../../models/remote'

/**
 * Function to determine which of the fork remotes added by the app are not
 * referenced anymore (by pull requests or local branches) and can be removed
 * from a repository.
 *
 * @param remotes All remotes available in the repository.
 * @param openPRs All open pull requests available in the repository.
 * @param allBranches All branches available in the repository.
 */
export function findForkedRemotesToPrune(
  remotes: readonly IRemote[],
  openPRs: ReadonlyArray<PullRequest>,
  allBranches: readonly Branch[]
) {
  const prRemoteUrls = new Set(
    openPRs.map(pr => pr.head.gitHubRepository.cloneURL)
  )
  const branchRemotes = new Set(
    allBranches.map(branch => branch.upstreamRemoteName)
  )

  return remotes.filter(
    r =>
      r.name.startsWith(ForkedRemotePrefix) &&
      !prRemoteUrls.has(r.url) &&
      !branchRemotes.has(r.name)
  )
}
