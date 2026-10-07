import { IAccountIdentity } from './account'

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
  /** The default branch name in case we're cloning an empty repository. */
  readonly defaultBranch?: string
  /**
   * The account to authenticate with, since the repository being cloned
   * can't be resolved to an account assignment yet. The endpoint must match
   * the one being cloned from. See `IGitExecutionOptions.fallbackAccount`.
   */
  readonly fallbackAccount?: IAccountIdentity
}

/** Options for cloning a repository through the app. */
export type CloneRepositoryOptions = {
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
  /** The default branch name in case we're cloning an empty repository. */
  readonly defaultBranch?: string
  /**
   * The account the user explicitly chose to clone with. Only this account
   * is considered: if it can't access the repository the clone fails rather
   * than using another account that happens to have access.
   */
  readonly account?: IAccountIdentity
}
