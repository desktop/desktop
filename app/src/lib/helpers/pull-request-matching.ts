import { IRemote } from '../../models/remote'
import { repositoryMatchesRemote } from '../repository-matching'
import { Branch } from '../../models/branch'
import { PullRequest } from '../../models/pull-request'

/**
 * Find the pull request for this branch.
 *
 * The upstream remote is only used
 * if the default remote returns no matches.
 *
 * @param branch branch in question
 * @param pullRequests list to search
 * @param remote remote to use for matching
 */
export function findAssociatedPullRequest(
  branch: Branch,
  pullRequests: ReadonlyArray<PullRequest>,
  remote: IRemote
): PullRequest | null {
  if (branch.upstreamWithoutRemote == null) {
    return null
  }

  return (
    pullRequests.find(pr =>
      isPullRequestAssociatedWithBranch(branch, pr, remote)
    ) || null
  )
}

export function isPullRequestAssociatedWithBranch(
  branch: Branch,
  pr: PullRequest,
  remote: IRemote
): boolean {
  return (
    pr.head.ref === branch.upstreamWithoutRemote &&
    repositoryMatchesRemote(pr.head.gitHubRepository, remote)
  )
}
