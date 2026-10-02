import { IAccountIdentity } from './account'

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
  /** The default branch name in case we're cloning an empty repository. */
  readonly defaultBranch?: string
  /** Account to use for HTTPS authentication while cloning. */
  readonly accountIdentity?: IAccountIdentity | null
}
