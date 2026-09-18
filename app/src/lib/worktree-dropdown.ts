/**
 * Whether a selected repository's worktree dropdown should be shown.
 *
 * Keep toolbar rendering and its resizable pane constraints in sync.
 */
export function shouldShowWorktreeDropdown(
  worktreeCount: number,
  isOpen: boolean,
  alwaysShowWorktreeList: boolean
): boolean {
  return alwaysShowWorktreeList || worktreeCount > 1 || isOpen
}
