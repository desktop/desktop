import { IRemote } from '../../models/remote'
import { repositoryMatchesRemote } from '../repository-matching'
import { Branch } from '../../models/branch'
import { PullRequest } from '../../models/pull-request'

export function findAssociatedPullRequest(
  branch: Branch,
  pullRequests: ReadonlyArray<PullRequest>,
  remotes: { default: IRemote; upstream: IRemote }
): PullRequest | null {
  const upstream = branch.upstreamWithoutRemote

  if (upstream == null) {
    return null
  }

  // first look for pull requests in the default remote
  const defaultRemotePr = pullRequests.find(pr =>
    isPullRequestAssociatedWithBranch(remotes.default, branch, pr)
  )
  if (defaultRemotePr !== undefined) {
    return defaultRemotePr
  }

  // if there isn't one, look for pull requests in the upstream remote
  const upstreamRemotePr = pullRequests.find(pr =>
    isPullRequestAssociatedWithBranch(remotes.upstream, branch, pr)
  )
  if (upstreamRemotePr !== undefined) {
    return upstreamRemotePr
  }

  // otherwise, return `null` for nothing found
  return null
}

export function isPullRequestAssociatedWithBranch(
  remote: IRemote,
  branch: Branch,
  pr: PullRequest
) {
  return (
    pr.head.ref === branch.upstreamWithoutRemote &&
    repositoryMatchesRemote(pr.head.gitHubRepository, remote)
  )
}
