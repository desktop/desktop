/**
 * An account which can be used to potentially authenticate with a git server.
 */
export interface IGitAccount {
  /** The login/username to authenticate with. */
  readonly login: string

  /** The endpoint with which the user is authenticating. */
  readonly endpoint: string

  /** The token/password to authenticate with */
  readonly token: string
}
