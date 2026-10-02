import { IAccountIdentity } from './repository'

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
  /** The default branch name in case we're cloning an empty repository. */
  readonly defaultBranch?: string
  /** The account chosen for HTTPS authentication before the clone is tracked. */
  readonly accountIdentity?: IAccountIdentity
}
