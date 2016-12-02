import { DiffLine, DiffHunk, ITextDiff } from '../../models/diff'

/**
 * Locate the diff hunk for the given (absolute) line number in the diff.
 */
export function diffHunkForIndex(diff: ITextDiff, index: number): DiffHunk | null {
  const hunk = diff.hunks.find(h => {
    return index >= h.unifiedDiffStart && index <= h.unifiedDiffEnd
  })
  return hunk || null
}

/**
 * Locate the diff line for the given (absolute) line number in the diff.
 */
export function diffLineForIndex(diff: ITextDiff, index: number): DiffLine | null {
  const hunk = diffHunkForIndex(diff, index)
  if (!hunk) { return null }

  return hunk.lines[index - hunk.unifiedDiffStart] || null
}