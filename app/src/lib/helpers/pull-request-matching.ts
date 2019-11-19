import { IRemote } from '../../models/remote'
import { repositoryMatchesRemote } from '../repository-matching'
import { Branch } from '../../models/branch'
import { PullRequest } from '../../models/pull-request'

/**
 * Remotes to use in searching for matching pull requests
 */
export type AvailableRemotes = {
  /** Default remote for repo (usually called `origin`) */
  default: IRemote
  /** Upstream remote for repo (usually called `upstream`) */
  upstream: IRemote | null
}

/** Possible remote matches for looking up a pull request */
const enum MatchedWithRemote {
  default,
  upstream,
  none,
}

/**
 * Find the pull request for this branch.
 *
 * The upstream remote is only used
 * if the default remote returns no matches.
 *
 * @param branch branch in question
 * @param pullRequests list to search
 * @param remotes remotes to use for matching
 */
export function findAssociatedPullRequest(
  branch: Branch,
  pullRequests: ReadonlyArray<PullRequest>,
  remotes: AvailableRemotes
): PullRequest | null {
  if (branch.upstreamWithoutRemote == null) {
    return null
  }

  const matchingPulls = pullRequests.filter(
    pr =>
      getMatchingRemoteForBranchPullRequest(branch, pr, remotes) !==
      MatchedWithRemote.none
  )
  switch (matchingPulls.length) {
    case 0:
      return null
    case 1:
      return matchingPulls[0]
    default: {
      return (
        matchingPulls.find(
          pr =>
            getMatchingRemoteForBranchPullRequest(branch, pr, remotes) ===
            MatchedWithRemote.default
        ) ||
        matchingPulls.find(
          pr =>
            getMatchingRemoteForBranchPullRequest(branch, pr, remotes) ===
            MatchedWithRemote.upstream
        ) ||
        null
      )
    }
  }
}

function getMatchingRemoteForBranchPullRequest(
  branch: Branch,
  pr: PullRequest,
  remotes: AvailableRemotes
): MatchedWithRemote {
  if (pr.head.ref === branch.upstreamWithoutRemote) {
    return repositoryMatchesRemote(pr.head.gitHubRepository, remotes.default)
      ? MatchedWithRemote.default
      : remotes.upstream &&
        repositoryMatchesRemote(pr.head.gitHubRepository, remotes.upstream)
      ? MatchedWithRemote.upstream
      : MatchedWithRemote.none
  }
  return MatchedWithRemote.none
}

export function isPullRequestAssociatedWithBranch(
  branch: Branch,
  pr: PullRequest,
  remotes: AvailableRemotes
): boolean {
  return (
    getMatchingRemoteForBranchPullRequest(branch, pr, remotes) !==
    MatchedWithRemote.none
  )
}
