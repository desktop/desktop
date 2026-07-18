import { Branch } from '../../../models/branch'
import { WorktreeEntry } from '../../../models/worktree'

/**
 * Determine which branch, if any, needs to be checked out in the current
 * worktree before `branchToDelete` can be deleted.
 *
 * If `branchToDelete` isn't the branch that's currently checked out here,
 * nothing needs to change and this returns `null`.
 *
 * Otherwise a fallback branch is picked - preferring the repository's
 * default branch, then falling back to the most recently used branch. That
 * fallback branch must not be `branchToDelete` itself, and - crucially - it
 * must not already be checked out in a *different* worktree, since Git
 * refuses to check out a branch that's already checked out elsewhere. Once
 * we're on the current branch we're deleting, using such a branch would
 * simply move the "used by worktree" failure from the delete to the
 * checkout, while the branch being deleted would remain checked out and the
 * delete would still fail as a result. See
 * https://github.com/desktop/desktop/issues/22569 for more context.
 *
 * @param branchToDelete The branch the caller wants to delete
 * @param currentBranch The branch currently checked out in this worktree,
 *                       or `null` if HEAD is unborn/detached
 * @param defaultBranch The repository's configured default branch, if any
 * @param recentBranches Branches ordered by how recently they were checked
 *                        out, most recent first
 * @param worktrees All worktrees known for this repository (including this
 *                   one)
 * @param currentWorktreePath The filesystem path of the worktree we're
 *                             about to check a branch out in (i.e. the
 *                             repository whose branch is being deleted)
 */
export function findBranchToCheckoutAfterDelete(
  branchToDelete: Branch,
  currentBranch: Branch | null,
  defaultBranch: Branch | null,
  recentBranches: ReadonlyArray<Branch>,
  worktrees: ReadonlyArray<WorktreeEntry>,
  currentWorktreePath: string
): Branch | null {
  // if current branch is not the branch being deleted, no need to switch
  // branches
  if (currentBranch !== null && branchToDelete.name !== currentBranch.name) {
    return null
  }

  // Branches already checked out in *other* worktrees aren't valid fallback
  // candidates - git won't let the same branch be checked out in two
  // worktrees at once.
  const branchesUsedByOtherWorktrees = new Set(
    worktrees
      .filter(wt => wt.path !== currentWorktreePath && wt.branch !== null)
      .map(wt => wt.branch)
  )

  const isValidCheckoutCandidate = (
    b: Branch | null | undefined
  ): b is Branch =>
    b !== null &&
    b !== undefined &&
    b.name !== branchToDelete.name &&
    !branchesUsedByOtherWorktrees.has(b.ref)

  // If the default branch is null, already checked out in another worktree,
  // or otherwise not a valid candidate, fall back to the most recent branch
  // that isn't the branch being deleted and isn't already checked out in
  // another worktree.
  const branchToCheckout = isValidCheckoutCandidate(defaultBranch)
    ? defaultBranch
    : recentBranches.find(isValidCheckoutCandidate)

  if (branchToCheckout === undefined) {
    throw new Error(
      branchesUsedByOtherWorktrees.size > 0
        ? `Unable to delete '${branchToDelete.name}' because it's checked ` +
          `out here and every other local branch is already checked out ` +
          `in another worktree. Switch to a different branch first.`
        : `It's not possible to delete the only existing branch in a repository.`
    )
  }

  return branchToCheckout
}
