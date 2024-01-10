import { DiffLine, DiffHunk, DiffLineType } from '../../models/diff'

/**
 * Indicate the type of changes that are included in the current range.
 */
export enum DiffRangeType {
  /** Only contains added lines. */
  Additions,
  /** Only contains deleted lines. */
  Deletions,
  /** Contains both added and removed lines. */
  Mixed,
}

/**
 * Helper object that represents a range of lines in a diff.
 * Its type represents the type of interactive (added or deleted)
 * lines that it contains, being null when it has no interactive lines.
 */
interface IDiffRange {
  readonly from: number
  readonly to: number
  readonly type: DiffRangeType | null
}

interface IDiffLineInfo {
  readonly line: DiffLine
  readonly hunk: DiffHunk
}

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
 * Locate the diff line and hunk for the given (absolute) line number in the diff.
 */
export function diffLineInfoForIndex(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): IDiffLineInfo | null {
  const hunk = diffHunkForIndex(hunks, index)
  if (!hunk) {
    return null
  }

  const line = hunk.lines[index - hunk.unifiedDiffStart]
  if (!line) {
    return null
  }

  return { hunk, line }
}

/**
 * Locate the diff line for the given (absolute) line number in the diff.
 */
export function diffLineForIndex(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): DiffLine | null {
  const diffLineInfo = diffLineInfoForIndex(hunks, index)
  if (diffLineInfo === null) {
    return null
  }

  return diffLineInfo.line
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
 * should be displayed as interactive, as a hunk is not granular enough.
 * The values in the returned range are mapped to lines in the original diff,
 * in case the current diff has been partially expanded.
 */
export function findInteractiveOriginalDiffRange(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): IDiffRange | null {
  const range = findInteractiveDiffRange(hunks, index)

  if (range === null) {
    return null
  }

  const from = getLineInOriginalDiff(hunks, range.from)
  const to = getLineInOriginalDiff(hunks, range.to)

  if (from === null || to === null) {
    return null
  }

  return {
    ...range,
    from,
    to,
  }
}

/**
 * Utility function to get the line number in the original line from a given
 * line number in the current text diff (which might be expanded).
 */
export function getLineInOriginalDiff(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
) {
  const diffLine = diffLineForIndex(hunks, index)
  if (diffLine === null) {
    return null
  }

  return diffLine.originalLineNumber
}

/**
 * For the given row in the diff, determine the range of elements that
 * should be displayed as interactive, as a hunk is not granular enough
 */
export function findInteractiveDiffRange(
  hunks: ReadonlyArray<DiffHunk>,
  index: number
): IDiffRange | null {
  const hunk = diffHunkForIndex(hunks, index)
  if (!hunk) {
    return null
  }

  const relativeIndex = index - hunk.unifiedDiffStart

  let rangeType: DiffRangeType | null = getNextRangeType(
    null,
    hunk.lines[relativeIndex]
  )
  let contextLineBeforeIndex: number | null = null

  for (let i = relativeIndex - 1; i >= 0; i--) {
    const line = hunk.lines[i]
    if (!line.isIncludeableLine()) {
      const startIndex = i + 1
      contextLineBeforeIndex = hunk.unifiedDiffStart + startIndex
      break
    }

    rangeType = getNextRangeType(rangeType, line)
  }

  const from =
    contextLineBeforeIndex !== null
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

    rangeType = getNextRangeType(rangeType, line)
  }

  const to =
    contextLineAfterIndex !== null ? contextLineAfterIndex : hunk.unifiedDiffEnd

  return { from, to, type: rangeType }
}

function getNextRangeType(
  currentRangeType: DiffRangeType | null,
  currentLine: DiffLine
): DiffRangeType | null {
  if (
    currentLine.type !== DiffLineType.Add &&
    currentLine.type !== DiffLineType.Delete
  ) {
    // If the current line is not interactive, ignore it.
    return currentRangeType
  }

  if (currentRangeType === null) {
    // If the current range type hasn't been set yet, we set it
    // temporarily to the current line type.
    return currentLine.type === DiffLineType.Add
      ? DiffRangeType.Additions
      : DiffRangeType.Deletions
  }

  if (currentRangeType === DiffRangeType.Mixed) {
    // If the current range type is Mixed we don't need to change it
    // (it can't go back to Additions or Deletions).
    return currentRangeType
  }

  if (
    (currentLine.type === DiffLineType.Add &&
      currentRangeType !== DiffRangeType.Additions) ||
    (currentLine.type === DiffLineType.Delete &&
      currentRangeType !== DiffRangeType.Deletions)
  ) {
    // If the current line has a different type than the current range type,
    // we automatically set the range type to mixed.
    return DiffRangeType.Mixed
  }

  return currentRangeType
}
