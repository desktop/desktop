// Temporary Node adapter; the implementation and types live in shared web source.
import { sep } from 'path'
import {
  WorktreeEntry,
  getWorktreeDisplayName as sharedName,
  getWorktreeAriaLabel as sharedLabel,
} from '../../../rust/web/src/upstream/models/worktree'
export * from '../../../rust/web/src/upstream/models/worktree'
export function getWorktreeDisplayName(worktree: WorktreeEntry): string {
  return sharedName(worktree, sep)
}
export function getWorktreeAriaLabel(worktree: WorktreeEntry): string {
  return sharedLabel(worktree, sep)
}
