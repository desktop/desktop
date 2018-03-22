/**
 * This is the magic remote name prefix
 * for when we add a remote on behalf of
 * the user.
 */
export const ForkedRemotePrefix = 'github-desktop-'

/** A remote as defined in Git. */
export interface IRemote {
  readonly name: string
  readonly url: string
}
