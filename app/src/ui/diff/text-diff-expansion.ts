import {
  DiffHunk,
  DiffHunkHeader,
  DiffLine,
  DiffLineType,
  ITextDiff,
} from '../../models/diff'

export const DiffExpansionDistance = 20

export type ExpansionKind = 'up' | 'down'

interface IHunkExpansionInfo {
  readonly isExpandableDown: boolean
  readonly isExpandableUp: boolean
  readonly isExpandableBoth: boolean
  readonly isExpandableShort: boolean
}

export function getDiffTextFromHunks(hunks: ReadonlyArray<DiffHunk>) {
  // Grab all hunk lines and rebuild the diff text from it
  const newDiffLines = hunks.reduce<ReadonlyArray<DiffLine>>(
    (result, hunk) => result.concat(hunk.lines),
    []
  )

  return newDiffLines.map(diffLine => diffLine.text).join('\n')
}

export function getHunkExpansionInfo(
  hunks: ReadonlyArray<DiffHunk>,
  hunk: DiffHunk
): IHunkExpansionInfo {
  let isExpandableDown = false
  let isExpandableUp = false
  let isExpandableBoth = false
  let isExpandableShort = false

  const hunkIndex = hunks.indexOf(hunk)
  const previousHunk = hunks[hunkIndex - 1]
  const distanceToPrevious =
    previousHunk === undefined
      ? Infinity
      : hunk.header.oldStartLine -
        previousHunk.header.oldStartLine -
        previousHunk.header.oldLineCount

  if (hunkIndex === 0) {
    isExpandableUp = true
  } else if (distanceToPrevious <= DiffExpansionDistance) {
    isExpandableShort = true
  } else if (hunkIndex === hunks.length - 1 && hunk.lines.length === 1) {
    isExpandableDown = true
  } else {
    isExpandableBoth = true
  }

  return {
    isExpandableDown,
    isExpandableUp,
    isExpandableBoth,
    isExpandableShort,
  }
}

export function expandTextDiffHunk(
  diff: ITextDiff,
  hunk: DiffHunk,
  kind: ExpansionKind,
  newContentLines: ReadonlyArray<string>
): ITextDiff | undefined {
  const hunkIndex = diff.hunks.indexOf(hunk)
  if (hunkIndex === -1) {
    return
  }

  const isExpandingUp = kind === 'up'
  const adjacentHunk =
    isExpandingUp && hunkIndex > 0
      ? diff.hunks[hunkIndex - 1]
      : !isExpandingUp && hunkIndex < diff.hunks.length - 1
      ? diff.hunks[hunkIndex + 1]
      : null

  // The adjacent hunk can only be the dummy hunk at the bottom if:
  //  - We're expanding down.
  //  - It only has one line.
  //  - That line is of type "Hunk".
  //  - The currently expanded hunk is the second-to-last (meaning the adjacent
  //    is the last hunk).
  const isAdjacentDummyHunk =
    adjacentHunk !== null &&
    isExpandingUp === false &&
    adjacentHunk.lines.length === 1 &&
    adjacentHunk.lines[0].type === DiffLineType.Hunk &&
    hunkIndex === diff.hunks.length - 2

  // Grab the hunk line of the hunk to expand
  const firstHunkLine = hunk.lines[0]
  const diffHunkLine =
    firstHunkLine.type === DiffLineType.Hunk ? firstHunkLine : null

  const newLineNumber = hunk.header.newStartLine
  const oldLineNumber = hunk.header.oldStartLine

  let [from, to] = isExpandingUp
    ? [newLineNumber - DiffExpansionDistance, newLineNumber]
    : [
        newLineNumber + hunk.header.newLineCount,
        newLineNumber + hunk.header.newLineCount + DiffExpansionDistance,
      ]

  if (adjacentHunk !== null) {
    if (isExpandingUp) {
      from = Math.max(
        from,
        adjacentHunk.header.newStartLine + adjacentHunk.header.newLineCount
      )
    } else {
      // Make sure we're not comparing against the dummy hunk at the bottom,
      // which is effectively taking all the undiscovered file contents and
      // would prevent us from expanding down the diff.
      if (isAdjacentDummyHunk === false) {
        to = Math.min(to, adjacentHunk.header.newStartLine - 1)
      }
    }
  }

  const newLines = newContentLines.slice(
    Math.max(from - 1, 0),
    Math.min(to - 1, newContentLines.length)
  )
  const numberOfLinesToAdd = newLines.length

  // Nothing to do here
  if (numberOfLinesToAdd === 0) {
    return
  }

  // Create the DiffLine instances using the right line numbers.
  const newLineDiffs = newLines.map((line, index) => {
    const newNewLineNumber = isExpandingUp
      ? newLineNumber - (numberOfLinesToAdd - index)
      : newLineNumber + hunk.header.newLineCount + index
    const newOldLineNumber = isExpandingUp
      ? oldLineNumber - (numberOfLinesToAdd - index)
      : oldLineNumber + hunk.header.oldLineCount + index

    // We need to prepend a space before the line text to match the diff
    // output.
    return new DiffLine(
      ' ' + line,
      DiffLineType.Context,
      newOldLineNumber,
      newNewLineNumber,
      false
    )
  })

  // Update the resulting hunk header with the new line count
  const newHunkHeader = new DiffHunkHeader(
    isExpandingUp
      ? hunk.header.oldStartLine - numberOfLinesToAdd
      : hunk.header.oldStartLine,
    hunk.header.oldLineCount + numberOfLinesToAdd,
    isExpandingUp
      ? hunk.header.newStartLine - numberOfLinesToAdd
      : hunk.header.newStartLine,
    hunk.header.newLineCount + numberOfLinesToAdd
  )

  // Create a new Hunk header line, except if we're expanding up and we
  // reached the top of the file. Store in an array to make it easier to add
  // later to the new list of lines.
  const newDiffHunkLine =
    diffHunkLine === null || (isExpandingUp && from <= 0)
      ? []
      : [
          new DiffLine(
            newHunkHeader.toDiffLineRepresentation(),
            DiffLineType.Hunk,
            diffHunkLine.oldLineNumber,
            diffHunkLine.newLineNumber,
            diffHunkLine.noTrailingNewLine
          ),
        ]

  const allButDiffLine = hunk.lines.slice(1)

  // Update the diff lines of the hunk with the new lines
  const updatedHunkLines = isExpandingUp
    ? [...newDiffHunkLine, ...newLineDiffs, ...allButDiffLine]
    : [...newDiffHunkLine, ...allButDiffLine, ...newLineDiffs]

  const numberOfNewDiffLines = updatedHunkLines.length - hunk.lines.length

  // Update the hunk with all the new info (header, lines, start/end...)
  const updatedHunk = new DiffHunk(
    newHunkHeader,
    updatedHunkLines,
    hunk.unifiedDiffStart,
    hunk.unifiedDiffEnd + numberOfNewDiffLines
  )

  const previousHunks = diff.hunks.slice(0, hunkIndex)

  // Grab the hunks after the current one, and update their start/end, but only
  // if the currently expanded hunk didn't reach the bottom of the file.
  const newHunkLastLine =
    newHunkHeader.newStartLine + newHunkHeader.newLineCount - 1
  const followingHunks =
    newHunkLastLine >= newContentLines.length
      ? []
      : diff.hunks
          .slice(hunkIndex + 1)
          .map(
            hunk =>
              new DiffHunk(
                hunk.header,
                hunk.lines,
                hunk.unifiedDiffStart + numberOfNewDiffLines,
                hunk.unifiedDiffEnd + numberOfNewDiffLines
              )
          )

  // TODO: merge hunks

  // Create the new list of hunks of the diff, and the new diff text
  const newHunks = [...previousHunks, updatedHunk, ...followingHunks]
  const newDiffText = getDiffTextFromHunks(newHunks)

  return {
    ...diff,
    text: newDiffText,
    hunks: newHunks,
  }
}
