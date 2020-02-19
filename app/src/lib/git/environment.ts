import { envForAuthentication } from './authentication'
import { IGitAccount } from '../../models/git-account'
import { enableAutomaticGitProxyConfiguration } from '../feature-flag'
import { resolveGitProxy } from '../proxy-resolver'

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
export function envForRemoteOperation(account: IGitAccount, remoteUrl: string) {
  return {
    ...envForAuthentication(account),
    ...envForProxy(remoteUrl),
  }
}

async function envForProxy(
  remoteUrl: string
): Promise<NodeJS.ProcessEnv | undefined> {
  if (!enableAutomaticGitProxyConfiguration()) {
    return undefined
  }

  // We'll play it safe and say that if the user has configured
  // the ALL_PROXY environment variable they probably know what
  // they're doing and wouldn't want us to override it with a
  // protocol-specific proxy. cURL supports both lower and upper
  // case, see:
  // https://github.com/curl/curl/blob/14916a82e/lib/url.c#L2180-L2185
  if ('ALL_PROXY' in process.env || 'all_proxy' in process.env) {
    log.info(`proxy url not resolved, ALL_PROXY already set`)
    return
  }

  const protocolMatch = /^(https?):\/\//i.exec(remoteUrl)

  // We can only resolve and use a proxy for the protocols where cURL
  // would be involved (i.e http and https). git:// relies on ssh.
  if (protocolMatch === null) {
    log.info(`proxy url not resolved, protocol not supported`)
    return
  }

  // Note that HTTPS here doesn't mean that the proxy is HTTPS, only
  // that all requests to HTTPS protocols should be proxied. The
  // proxy protocol is defined by the url returned by `this.resolve()`
  const proto = protocolMatch[1].toUpperCase() // HTTP or HTTPS
  const protoEnvKey = `${proto}_PROXY` // HTTP_PROXY or HTTPS_PROXY

  // If the user has already configured a proxy in the environment
  // for the protocol we're not gonna override it.
  if (protoEnvKey in process.env || protoEnvKey.toLowerCase() in process.env) {
    log.info(`proxy url not resolved, ${protoEnvKey} already set`)
    return
  }

  const proxyUrl = await resolveGitProxy(remoteUrl)
  return proxyUrl === undefined ? undefined : { [protoEnvKey]: proxyUrl }
}
