import { trampolineServer } from './trampoline-server'
import { withTrampolineToken } from './trampoline-tokens'
import * as Path from 'path'
import { getDesktopTrampolineFilename } from 'desktop-trampoline'
import { TrampolineCommandIdentifier } from '../trampoline/trampoline-command'
import { getSSHEnvironment } from '../ssh/ssh'
import {
  removePendingSSHKeyPassphraseToStore,
  storePendingSSHKeyPassphrase,
} from '../ssh/ssh-key-passphrase'

/**
 * Allows invoking a function with a set of environment variables to use when
 * invoking a Git subcommand that needs to use the trampoline (mainly git
 * operations requiring an askpass script) and with a token to use in the
 * trampoline server.
 * It will handle saving SSH key passphrases when needed if the git operation
 * succeeds.
 *
 * @param fn        Function to invoke with all the necessary environment
 *                  variables.
 */
export async function withTrampolineEnv<T>(
  fn: (env: Object) => Promise<T>
): Promise<T> {
  const sshEnv = await getSSHEnvironment()

  return withTrampolineToken(async token => {
    // The code below assumes a few things in order to manage SSH key passphrases
    // correctly:
    // 1. `withTrampolineEnv` is only used in the functions `git` (core.ts) and
    //    `spawnAndComplete` (spawn.ts)
    // 2. Those two functions always thrown an error when something went wrong,
    //    and just return a result when everything went fine.
    //
    // With those two premises in mind, we can safely assume that right after
    // `fn` has been invoked, we can store the SSH key passphrase for this git
    // operation if there was one pending to be stored.
    try {
      const result = await fn({
        DESKTOP_PORT: await trampolineServer.getPort(),
        DESKTOP_TRAMPOLINE_TOKEN: token,
        GIT_ASKPASS: getDesktopTrampolinePath(),
        DESKTOP_TRAMPOLINE_IDENTIFIER: TrampolineCommandIdentifier.AskPass,

        ...sshEnv,
      })

      await storePendingSSHKeyPassphrase(token)

      return result
    } finally {
      removePendingSSHKeyPassphraseToStore(token)
    }
  })
}

/** Returns the path of the desktop-trampoline binary. */
export function getDesktopTrampolinePath(): string {
  return Path.resolve(
    __dirname,
    'desktop-trampoline',
    getDesktopTrampolineFilename()
  )
}

/** Returns the path of the ssh-wrapper binary. */
export function getSSHWrapperPath(): string {
  return Path.resolve(__dirname, 'desktop-trampoline', 'ssh-wrapper')
}
