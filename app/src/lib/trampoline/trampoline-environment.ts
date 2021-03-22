import { IGitAccount } from '../../models/git-account'
import { envForRemoteOperation } from '../git/environment'
import { trampolineServer } from './trampoline-server'
import { withTrampolineToken } from './trampoline-tokens'

/**
 * Allows invoking a function with a set of environment variables to use when
 * invoking a Git subcommand that needs to communicate with a remote (i.e.
 * fetch, clone, push, pull, ls-remote, etc etc) and with a token to use in the
 * trampoline server.
 *
 * For more info about the specific environment variables used in the remote
 * git operation, please see `envForRemoteOperation`.
 *
 * @param account   The authentication information (if available) to provide
 *                  to Git for use when connecting to the remote
 * @param remoteUrl The primary remote URL for this operation. Note that Git
 *                  might connect to other remotes in order to fulfill the
 *                  operation. As an example, a clone of
 *                  https://github.com/desktop/desktop could contain a submodule
 *                  pointing to another host entirely. Used to resolve which
 *                  proxy (if any) should be used for the operation.
 * @param fn        Function to invoke with all the necessary environment
 *                  variables.
 */
export async function withTrampolineEnvForRemoteOperation<T>(
  account: IGitAccount | null,
  remoteUrl: string,
  fn: (env: Object) => Promise<T>
): Promise<T> {
  const env = await envForRemoteOperation(account, remoteUrl)

  return withTrampolineToken(async token =>
    fn({
      ...env,
      DESKTOP_PORT: await trampolineServer.getPort(),
      DESKTOP_TRAMPOLINE_TOKEN: token,
    })
  )
}
