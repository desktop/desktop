import * as Path from 'path'

import { GitError as DugiteError } from 'dugite'

/** Get the environment for authenticating remote operations. */
export function envForAuthentication(account: Account | null): Object {
  const env = {
    DESKTOP_PATH: process.execPath,
    DESKTOP_ASKPASS_SCRIPT: getAskPassScriptPath(),
    GIT_ASKPASS: getAskPassTrampolinePath(),
    // supported since Git 2.3, this is used to ensure we never interactively prompt
    // for credentials - even as a fallback
    GIT_TERMINAL_PROMPT: '0',
  }

  if (!account) {
    return env
  }

  return {
    ...env,
    DESKTOP_USERNAME: account.login,
    DESKTOP_ENDPOINT: account.endpoint,
  }
}

/** The set of errors which fit under the "authentication failed" umbrella. */
export function expectedAuthenticationErrors(): Set<DugiteError> {
  return new Set([
    DugiteError.HTTPSAuthenticationFailed,
    DugiteError.SSHAuthenticationFailed,
    DugiteError.HTTPSRepositoryNotFound,
    DugiteError.SSHRepositoryNotFound,
  ])
}

function getAskPassTrampolinePath(): string {
  const extension = __WIN32__ ? 'bat' : 'sh'
  return Path.resolve(__dirname, 'static', `ask-pass-trampoline.${extension}`)
}

function getAskPassScriptPath(): string {
  return Path.resolve(__dirname, 'ask-pass.js')
}
