import * as Path from 'path'
import { getDesktopTrampolineFilename } from 'desktop-trampoline'
import { IGitAccount } from '../../models/git-account'
import { envForRemoteOperation } from '../git/environment'
import { TrampolineCommandIdentifier } from './trampoline-command'
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

export async function withTrampolineEnvForCommitSigning<T>(
  account: IGitAccount | null,
  fn: (
    configArgs: ReadonlyArray<string>,
    signArgs: ReadonlyArray<string>,
    env: Object
  ) => Promise<T>
): Promise<T> {
  if (account === null) {
    return fn([], [], {})
  }

  return withTrampolineToken(async token =>
    fn(['-c', `gpg.program=${getDesktopTrampolinePath()}`], ['--gpg-sign'], {
      DESKTOP_USERNAME: account.login,
      DESKTOP_ENDPOINT: account.endpoint,
      DESKTOP_PORT: await trampolineServer.getPort(),
      DESKTOP_TRAMPOLINE_TOKEN: token,
      DESKTOP_TRAMPOLINE_IDENTIFIER: TrampolineCommandIdentifier.GPG,
      GIT_COMMITTER_NAME: 'GitHub',
      GIT_COMMITTER_EMAIL: 'noreply@github.com',
    })
  )
}

function getDesktopTrampolinePath(): string {
  return Path.resolve(
    __dirname,
    'desktop-trampoline',
    getDesktopTrampolineFilename()
  )
}
