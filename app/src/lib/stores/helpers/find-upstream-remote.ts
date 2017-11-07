import { GitHubRepository } from '../../../models/github-repository'
import { IRemote } from '../../../models/remote'
import { parseRemote } from '../../remote-parsing'
import { forceUnwrap } from '../../fatal-error'

/** The name for a fork's upstream remote. */
export const UpstreamRemoteName = 'upstream'

export function findUpstreamRemote(
  parent: GitHubRepository,
  remotes: ReadonlyArray<IRemote>
): IRemote | null {
  const upstream = remotes.find(r => r.name === UpstreamRemoteName)
  if (!upstream) {
    return null
  }

  const parsedUpstream = parseRemote(upstream.url)
  const cloneURL = forceUnwrap(
    'Parent repositories are fully loaded',
    parent.cloneURL
  )
  const parentURL = new URL(cloneURL)
  if (
    parsedUpstream &&
    parsedUpstream.owner === parent.owner.login &&
    parsedUpstream.name === parent.name &&
    parsedUpstream.hostname === parentURL.hostname
  ) {
    return upstream
  } else {
    return null
  }
}
