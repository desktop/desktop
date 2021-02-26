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

function mergeDiffHunks(hunk1: DiffHunk, hunk2: DiffHunk): DiffHunk {
  const firstHunk1Line = hunk1.lines[0]
  const allHunk1LinesButFirst = hunk1.lines.slice(1)
  const allHunk2LinesButFirst = hunk2.lines.slice(1)

  const newHunkHeader = new DiffHunkHeader(
    hunk1.header.oldStartLine,
    hunk1.header.oldLineCount + hunk2.header.oldLineCount,
    hunk1.header.newStartLine,
    hunk1.header.newLineCount + hunk2.header.newLineCount
  )

  // Update the first line if it was a Hunk line, otherwise keep the original
  const newFirstHunkLine =
    firstHunk1Line.type !== DiffLineType.Hunk
      ? firstHunk1Line
      : new DiffLine(
          newHunkHeader.toDiffLineRepresentation(),
          DiffLineType.Hunk,
          null,
          null,
          false
        )

  return new DiffHunk(
    newHunkHeader,
    [newFirstHunkLine, ...allHunk1LinesButFirst, ...allHunk2LinesButFirst],
    hunk1.unifiedDiffStart,
    // This -1 represents the Hunk line of the second hunk that we removed
    hunk2.unifiedDiffEnd - 1
  )
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
  const adjacentHunkIndex =
    isExpandingUp && hunkIndex > 0
      ? hunkIndex - 1
      : !isExpandingUp && hunkIndex < diff.hunks.length - 1
      ? hunkIndex + 1
      : null
  const adjacentHunk =
    adjacentHunkIndex !== null ? diff.hunks[adjacentHunkIndex] : null

  // The adjacent hunk can only be the dummy hunk at the bottom if:
  //  - We're expanding down.
  //  - It only has one line.
  //  - That line is of type "Hunk".
  //  - The adjacent hunk is the last one.
  const isAdjacentDummyHunk =
    adjacentHunk !== null &&
    isExpandingUp === false &&
    adjacentHunk.lines.length === 1 &&
    adjacentHunk.lines[0].type === DiffLineType.Hunk &&
    adjacentHunkIndex === diff.hunks.length - 1

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

  // We will merge the current hunk with the adjacent only if the expansion
  // ends where the adjacent hunk begins (depending on the expansion direction).
  let shouldMergeWithAdjacent = false

  if (adjacentHunk !== null) {
    if (isExpandingUp) {
      const upLimit =
        adjacentHunk.header.newStartLine + adjacentHunk.header.newLineCount
      from = Math.max(from, upLimit)
      shouldMergeWithAdjacent = from === upLimit
    } else {
      // Make sure we're not comparing against the dummy hunk at the bottom,
      // which is effectively taking all the undiscovered file contents and
      // would prevent us from expanding down the diff.
      if (isAdjacentDummyHunk === false) {
        const downLimit = adjacentHunk.header.newStartLine - 1
        to = Math.min(to, downLimit)
        shouldMergeWithAdjacent = to === downLimit
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

  const allHunkLinesButFirst = hunk.lines.slice(1)

  // Update the diff lines of the hunk with the new lines
  const updatedHunkLines = isExpandingUp
    ? [...newDiffHunkLine, ...newLineDiffs, ...allHunkLinesButFirst]
    : [...newDiffHunkLine, ...allHunkLinesButFirst, ...newLineDiffs]

  let numberOfNewDiffLines = updatedHunkLines.length - hunk.lines.length

  // Update the hunk with all the new info (header, lines, start/end...)
  let updatedHunk = new DiffHunk(
    newHunkHeader,
    updatedHunkLines,
    hunk.unifiedDiffStart,
    hunk.unifiedDiffEnd + numberOfNewDiffLines
  )

  let previousHunksEndIndex = 0 // Exclusive
  let followingHunksStartIndex = 0 // Inclusive

  // Merge hunks if needed. Depending on whether we need to merge the current
  // hunk and the adjacent, we will strip (or not) the adjacent from the list
  // of hunks, and replace the current one with the merged version.
  if (shouldMergeWithAdjacent && adjacentHunk !== null) {
    if (isExpandingUp) {
      updatedHunk = mergeDiffHunks(adjacentHunk, updatedHunk)
      previousHunksEndIndex = hunkIndex - 1
      followingHunksStartIndex = hunkIndex + 1
    } else {
      previousHunksEndIndex = hunkIndex
      followingHunksStartIndex = hunkIndex + 2
      updatedHunk = mergeDiffHunks(updatedHunk, adjacentHunk)
    }

    // After merging, there is one line less (the Hunk header line from one
    // of the merged hunks).
    numberOfNewDiffLines = numberOfNewDiffLines - 1
  } else {
    previousHunksEndIndex = hunkIndex
    followingHunksStartIndex = hunkIndex + 1
  }

  const previousHunks = diff.hunks.slice(0, previousHunksEndIndex)

  // Grab the hunks after the current one, and update their start/end, but only
  // if the currently expanded hunk didn't reach the bottom of the file.
  const newHunkLastLine =
    newHunkHeader.newStartLine + newHunkHeader.newLineCount - 1
  const followingHunks =
    newHunkLastLine >= newContentLines.length
      ? []
      : diff.hunks
          .slice(followingHunksStartIndex)
          .map(
            hunk =>
              new DiffHunk(
                hunk.header,
                hunk.lines,
                hunk.unifiedDiffStart + numberOfNewDiffLines,
                hunk.unifiedDiffEnd + numberOfNewDiffLines
              )
          )

  // Create the new list of hunks of the diff, and the new diff text
  const newHunks = [...previousHunks, updatedHunk, ...followingHunks]
  const newDiffText = getDiffTextFromHunks(newHunks)

  return {
    ...diff,
    text: newDiffText,
    hunks: newHunks,
  }
}
