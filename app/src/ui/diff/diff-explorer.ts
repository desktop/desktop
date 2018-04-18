import { DiffLine, DiffHunk } from '../../models/diff'

/**
 * Locate the diff hunk for the given (absolute) line number in the diff.
 */
export function diffHunkForIndex(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): DiffHunk | null {
  const hunk = hunks.find(h => {
    return index >= h.unifiedDiffStart && index <= h.unifiedDiffEnd
  })
  return hunk || null
}

/**
 * Locate the diff line for the given (absolute) line number in the diff.
 */
export function diffLineForIndex(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): DiffLine | null {
  const hunk = diffHunkForIndex(hunks, index)
  if (!hunk) {
    return null
  }

  return hunk.lines[index - hunk.unifiedDiffStart] || null
}

/** Get the line number as represented in the diff text itself. */
export function lineNumberForDiffLine(
  diffLine: DiffLine,
  hunks: ReadonlyArray<DiffHunk>
): number {
  let lineOffset = 0
  for (const hunk of hunks) {
    const index = hunk.lines.indexOf(diffLine)
    if (index > -1) {
      return index + lineOffset
    } else {
      lineOffset += hunk.lines.length
    }
  }

  return -1
}

/**
 * For the given row in the diff, determine the range of elements that
 * should be displayed as interactive, as a hunk is not granular enough
 */
export function findInteractiveDiffRange(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): { start: number; end: number } | null {
  const hunk = diffHunkForIndex(hunks, index)
  if (!hunk) {
    return null
  }

  const relativeIndex = index - hunk.unifiedDiffStart

  let contextLineBeforeIndex: number | null = null
  for (let i = relativeIndex - 1; i >= 0; i--) {
    const line = hunk.lines[i]
    if (!line.isIncludeableLine()) {
      const startIndex = i + 1
      contextLineBeforeIndex = hunk.unifiedDiffStart + startIndex
      break
    }
  }

  const start = contextLineBeforeIndex
    ? contextLineBeforeIndex
    : hunk.unifiedDiffStart + 1

  let contextLineAfterIndex: number | null = null

  for (let i = relativeIndex + 1; i < hunk.lines.length; i++) {
    const line = hunk.lines[i]
    if (!line.isIncludeableLine()) {
      const endIndex = i - 1
      contextLineAfterIndex = hunk.unifiedDiffStart + endIndex
      break
    }
  }

  const end = contextLineAfterIndex
    ? contextLineAfterIndex
    : hunk.unifiedDiffEnd

  return { start, end }
}
