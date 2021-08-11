import { trampolineServer } from './trampoline-server'
import { withTrampolineToken } from './trampoline-tokens'
import * as Path from 'path'
import { enableDesktopTrampoline } from '../feature-flag'
import { getDesktopTrampolineFilename } from 'desktop-trampoline'
import { TrampolineCommandIdentifier } from '../trampoline/trampoline-command'

/**
 * Allows invoking a function with a set of environment variables to use when
 * invoking a Git subcommand that needs to use the trampoline (mainly git
 * operations requiring an askpass script) and with a token to use in the
 * trampoline server.
 *
 * @param fn        Function to invoke with all the necessary environment
 *                  variables.
 */
export async function withTrampolineEnv<T>(
  fn: (env: Object) => Promise<T>
): Promise<T> {
  const askPassPath = enableDesktopTrampoline()
    ? getDesktopTrampolinePath()
    : getAskPassTrampolinePath()

  return withTrampolineToken(async token =>
    fn({
      DESKTOP_PORT: await trampolineServer.getPort(),
      DESKTOP_TRAMPOLINE_TOKEN: token,
      GIT_ASKPASS: askPassPath,
      DESKTOP_TRAMPOLINE_IDENTIFIER: TrampolineCommandIdentifier.AskPass,

      // Env variables specific to the old askpass trampoline
      DESKTOP_PATH: process.execPath,
      DESKTOP_ASKPASS_SCRIPT: getAskPassScriptPath(),
    })
  )
}

/** Returns the path of the desktop-trampoline binary. */
export function getDesktopTrampolinePath(): string {
  return Path.resolve(
    __dirname,
    'desktop-trampoline',
    getDesktopTrampolineFilename()
  )
}

function getAskPassTrampolinePath(): string {
  const extension = __WIN32__ ? 'bat' : 'sh'
  return Path.resolve(__dirname, 'static', `ask-pass-trampoline.${extension}`)
}

function getAskPassScriptPath(): string {
  return Path.resolve(__dirname, 'ask-pass.js')
}
