import { envForAuthentication } from './authentication'
import { resolveGitProxy } from '../resolve-git-proxy'
import { getHTMLURL } from '../api'
import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../models/repository'
import { IRemote } from '../../models/remote'

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
 *
 * @param branchName If the operation we're about to undertake is related to a
 *                   local ref (i.e branch) then we can use that to resolve its
 *                   upstream tracking branch (and thereby its remote) and use
 *                   that as the probable url to resolve a proxy for.
 */
export function getFallbackUrlForProxyResolve(
  repository: Repository,
  currentRemote: IRemote | null
) {
  // We used to use account.endpoint here but we look up account by the
  // repository endpoint (see getAccountForRepository) so we can skip the use
  // of the account here and just use the repository endpoint directly.
  if (isRepositoryWithGitHubRepository(repository)) {
    return getHTMLURL(repository.gitHubRepository.endpoint)
  }

  // This is a carry-over from the old code where we would use the current
  // remote to resolve an account and then use that account's endpoint here.
  // We've since removed the need to pass an account down here but unfortunately
  // that means we need to pass the current remote instead. Note that ideally
  // this should be looking up the remote url either based on the currently
  // checked out branch, the upstream tracking branch of the branch being
  // checked out, or the default remote if neither of those are available.
  // Doing so by shelling out to Git here was deemed to costly and in order to
  // finish this refactor we've opted to replicate the previous behavior here.
  if (currentRemote) {
    return currentRemote.url
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
 *                  to Git for use when connecting to the remote
 * @param remoteUrl The primary remote URL for this operation. Note that Git
 *                  might connect to other remotes in order to fulfill the
 *                  operation. As an example, a clone of
 *                  https://github.com/desktop/desktop could contain a submodule
 *                  pointing to another host entirely. Used to resolve which
 *                  proxy (if any) should be used for the operation.
 */
export async function envForRemoteOperation(remoteUrl: string) {
  return {
    ...envForAuthentication(),
    ...(await envForProxy(remoteUrl)),
  }
}

/**
 * Not intended to be used directly. Exported only in order to
 * allow for testing.
 *
 * @param remoteUrl The remote url to resolve a proxy for.
 * @param env       The current environment variables, defaults
 *                  to `process.env`
 * @param resolve   The method to use when resolving the proxy url,
 *                  defaults to `resolveGitProxy`
 */
export async function envForProxy(
  remoteUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  resolve: (url: string) => Promise<string | undefined> = resolveGitProxy
): Promise<Record<string, string | undefined> | undefined> {
  const protocolMatch = /^(https?):\/\//i.exec(remoteUrl)

  // We can only resolve and use a proxy for the protocols where cURL
  // would be involved (i.e http and https). git:// relies on ssh.
  if (protocolMatch === null) {
    return
  }

  // Note that HTTPS here doesn't mean that the proxy is HTTPS, only
  // that all requests to HTTPS protocols should be proxied. The
  // proxy protocol is defined by the url returned by `this.resolve()`
  const proto = protocolMatch[1].toLowerCase() // http or https

  // We'll play it safe and say that if the user has configured
  // the ALL_PROXY environment variable they probably know what
  // they're doing and wouldn't want us to override it with a
  // protocol-specific proxy. cURL supports both lower and upper
  // case, see:
  // https://github.com/curl/curl/blob/14916a82e/lib/url.c#L2180-L2185
  if ('ALL_PROXY' in env || 'all_proxy' in env) {
    log.info(`proxy url not resolved, ALL_PROXY already set`)
    return
  }

  // Lower case environment variables due to
  // https://ec.haxx.se/usingcurl/usingcurl-proxies#http_proxy-in-lower-case-only
  const envKey = `${proto}_proxy` // http_proxy or https_proxy

  // If the user has already configured a proxy in the environment
  // for the protocol we're not gonna override it.
  if (envKey in env || (proto === 'https' && 'HTTPS_PROXY' in env)) {
    log.info(`proxy url not resolved, ${envKey} already set`)
    return
  }

  const proxyUrl = await resolve(remoteUrl).catch(err => {
    log.error('Failed resolving Git proxy', err)
    return undefined
  })

  return proxyUrl === undefined ? undefined : { [envKey]: proxyUrl }
}
