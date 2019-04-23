type MergeOrPullConflictsErrorContext = {
  /** The Git operation that triggered the conflicted state */
  readonly kind: 'merge' | 'pull'
  /** The branch being merged into the current branch, "theirs" in Git terminology */
  readonly theirBranch: string
  /** The branch associated with the current tip of the repository, "ours" in Git terminology */
  readonly currentBranch: string
}

/** A custom shape of data for actions to provide to help with error handling */
export type GitErrorContext = MergeOrPullConflictsErrorContext
