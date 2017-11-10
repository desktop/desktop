import { GitHubRepository } from '../../../models/github-repository'
import { IRemote } from '../../../models/remote'
import { parseRemote } from '../../remote-parsing'
import { forceUnwrap } from '../../fatal-error'

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

  const parsedUpstream = parseRemote(upstream.url)
  if (!parsedUpstream || !parsedUpstream.name || !parsedUpstream.owner) {
    return null
  }

  const cloneURL = forceUnwrap(
    'Parent repositories are fully loaded',
    parent.cloneURL
  )
  const parentURL = new URL(cloneURL)
  if (
    parsedUpstream.owner.toLowerCase() === parent.owner.login.toLowerCase() &&
    parsedUpstream.name.toLowerCase() === parent.name.toLowerCase() &&
    parsedUpstream.hostname.toLowerCase() === parentURL.hostname.toLowerCase()
  ) {
    return upstream
  } else {
    return null
  }
}
