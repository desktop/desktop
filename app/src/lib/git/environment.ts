import { envForAuthentication } from './authentication'
import { IGitAccount } from '../../models/git-account'
import { getDotComAPIEndpoint } from '../api'
import { Repository } from '../../models/repository'

/**
 * For many remote operations it's well known what the primary remote
 * url is (clone, push, fetch etc). But in some cases it's not as easy.
 *
 * Two examples are checkout, and revert where neither would need to
 * hit the network in vanilla Git usage but do need to when LFS gets
 * involved.
 *
 * What's the primary url when using LFS then? Most likely it's gonna
 * be on the same as the default remote but it could theoretically
 * be on a different server as well. That's too advanced for our usage
 * at the moment though so we'll just need to figure out some reasonable
 * url to fall back on.
 */
export function getFallbackUrlForProxyResolve(
  account: IGitAccount | null,
  repository: Repository
) {
  // If we've got an account with an endpoint that means we've already done the
  // heavy lifting to figure out what the most likely endpoint is gonna be
  // so we'll try to leverage that.
  if (account !== null) {
    // A GitHub.com Account will have api.github.com as its endpoint
    return account.endpoint === getDotComAPIEndpoint()
      ? 'https://github.com'
      : account.endpoint
  }

  if (repository.gitHubRepository !== null) {
    if (repository.gitHubRepository.cloneURL !== null) {
      return repository.gitHubRepository.cloneURL
    }
  }

  // If all else fails let's assume that whatever network resource
  // Git is gonna hit it's gonna be using the same proxy as it would
  // if it was a GitHub.com endpoint
  return 'https://github.com'
}

/**
 * Create a set of environment variables to use when invoking a Git
 * subcommand that needs to communicate with a remote (i.e. fetch, clone,
 * push, pull, ls-remote, etc etc).
 *
 * The environment variables deal with setting up sane defaults, configuring
 * authentication, and resolving proxy urls if necessary.
 *
 * @param account   The authentication information (if available) to provide
 *                  to Git for use when connectingt to the remote
 * @param remoteUrl The primary remote URL for this operation. Note that Git
 *                  might connect to other remotes in order to fulfill the
 *                  operation. As an example, a clone of
 *                  https://github.com/desktop/desktop could containt a submodule
 *                  pointing to another host entirely. Used to resolve which
 *                  proxy (if any) should be used for the operation.
 */
export async function envForRemoteOperation(
  account: IGitAccount | null,
  remoteUrl: string
) {
  return {
    ...envForAuthentication(account),
  }
}
