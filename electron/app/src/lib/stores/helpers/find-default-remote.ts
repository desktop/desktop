import { IRemote } from '../../../models/remote'

/**
 * Attempt to find the remote which we consider to be the "default"
 * remote, i.e. in most cases the 'origin' remote.
 *
 * If no remotes are given this method will return null, if no "default"
 * branch could be found the first remote is considered the default.
 *
 * @param remotes A list of remotes for a given repository
 */
export function findDefaultRemote(
  remotes: ReadonlyArray<IRemote>
): IRemote | null {
  return remotes.find(x => x.name === 'origin') || remotes[0] || null
}
