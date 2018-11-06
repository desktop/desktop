import { IGitAccount } from './git-account'

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The optional identity to provide when cloning. */
  readonly account: IGitAccount | null
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
}
