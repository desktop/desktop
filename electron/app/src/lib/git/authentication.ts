import { GitError as DugiteError } from 'dugite'

/** Get the environment for authenticating remote operations. */
export function envForAuthentication(): Record<string, string | undefined> {
  return {
    // supported since Git 2.3, this is used to ensure we never interactively prompt
    // for credentials - even as a fallback
    GIT_TERMINAL_PROMPT: '0',
    GIT_TRACE: localStorage.getItem('git-trace') || '0',
  }
}

/** The set of errors which fit under the "authentication failed" umbrella. */
export const AuthenticationErrors: ReadonlySet<DugiteError> = new Set([
  DugiteError.HTTPSAuthenticationFailed,
  DugiteError.SSHAuthenticationFailed,
  DugiteError.HTTPSRepositoryNotFound,
  DugiteError.SSHRepositoryNotFound,
])
