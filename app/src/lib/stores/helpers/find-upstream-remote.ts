import { GitHubRepository } from '../../../models/github-repository'
import { IRemote } from '../../../models/remote'
import { repositoryMatchesRemote } from '../../repository-matching'

/** The name for a fork's upstream remote. */
export const UpstreamRemoteName = 'upstream'

/**
 * Find the upstream remote based on the parent repository and the list of
 * remotes.
 */
export function findUpstreamRemote(
  parent: GitHubRepository,
  remotes: ReadonlyArray<IRemote>
): IRemote | null {
  const upstream = remotes.find(r => r.name === UpstreamRemoteName)
  if (!upstream) {
    return null
  }

  return repositoryMatchesRemote(parent, upstream) ? upstream : null
}
