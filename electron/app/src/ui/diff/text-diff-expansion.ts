import {
  DiffHunk,
  DiffHunkExpansionType,
  DiffHunkHeader,
  DiffLine,
  DiffLineType,
  ITextDiff,
} from '../../models/diff'
import { getLargestLineNumber } from './diff-helpers'
import { HiddenBidiCharsRegex } from '../../lib/diff-parser'

/** How many new lines will be added to a diff hunk by default. */
export const DefaultDiffExpansionStep = 20

/** Type of expansion: could be up or down. */
export type DiffExpansionKind = 'up' | 'down'

/** Builds the diff text string given a list of hunks. */
function getDiffTextFromHunks(hunks: ReadonlyArray<DiffHunk>) {
  // Grab all hunk lines and rebuild the diff text from it
  const newDiffLines = hunks.reduce<ReadonlyArray<DiffLine>>(
    (result, hunk) => result.concat(hunk.lines),
    []
  )

  return newDiffLines.map(diffLine => diffLine.text).join('\n')
}

/** Merges two consecutive hunks into one. */
function mergeDiffHunks(hunk1: DiffHunk, hunk2: DiffHunk): DiffHunk {
  // Remove the first line in both hunks, because those are hunk header lines
  // that will be replaced by a new one for the resulting hunk.
  const allHunk1LinesButFirst = hunk1.lines.slice(1)
  const allHunk2LinesButFirst = hunk2.lines.slice(1)

  const newHunkHeader = new DiffHunkHeader(
    hunk1.header.oldStartLine,
    hunk1.header.oldLineCount + hunk2.header.oldLineCount,
    hunk1.header.newStartLine,
    hunk1.header.newLineCount + hunk2.header.newLineCount
  )

  // Create a new hunk header line for the resulting hunk
  const newFirstHunkLine = new DiffLine(
    newHunkHeader.toDiffLineRepresentation(),
    DiffLineType.Hunk,
    null,
    null,
    null,
    false
  )

  const newHunkLines = [
    newFirstHunkLine,
    ...allHunk1LinesButFirst,
    ...allHunk2LinesButFirst,
  ]

  return new DiffHunk(
    newHunkHeader,
    newHunkLines,
    hunk1.unifiedDiffStart,
    hunk1.unifiedDiffStart + newHunkLines.length - 1,
    // The expansion type of the resulting hunk will match the expansion type
    // of the first hunk:
    // - If the first hunk can be expanded up, it means it's the very first
    //   hunk, so the resulting hunk will be the first too.
    // - If the first hunk can be expanded but short, that doesn't change after
    //   merging it with the second one.
    // - If it can be expanded up and down (meaning it's a long gap), that
    //   doesn't change after merging it with the second one.
    // - It can never be expanded down exclusively, because only the last dummy
    //   hunk can do that, and that will never be the first hunk in a merge.
    hunk1.expansionType
  )
}

/**
 * Calculates whether or not a hunk header can be expanded up, down, both, or if
 * the space represented by the hunk header is short and expansion there would
 * mean merging with the hunk above.
 *
 * @param hunkIndex     Index of the hunk to evaluate within the whole diff.
 * @param hunkHeader    Header of the hunk to evaluate.
 * @param previousHunk  Hunk previous to the one to evaluate. Null if the
 *                      evaluated hunk is the first one.
 */
export function getHunkHeaderExpansionType(
  hunkIndex: number,
  hunkHeader: DiffHunkHeader,
  previousHunk: DiffHunk | null
): DiffHunkExpansionType {
  const distanceToPrevious =
    previousHunk === null
      ? Infinity
      : hunkHeader.oldStartLine -
        previousHunk.header.oldStartLine -
        previousHunk.header.oldLineCount

  // In order to simplify the whole logic around expansion, only the hunk at the
  // top can be expanded up exclusively, and only the hunk at the bottom (the
  // dummy one, see getTextDiffWithBottomDummyHunk) can be expanded down
  // exclusively.
  // The rest of the hunks can be expanded both ways, except those which are too
  // short and therefore the direction of expansion doesn't matter.
  if (hunkIndex === 0) {
    // The top hunk can only be expanded if there is content above it
    if (hunkHeader.oldStartLine > 1 && hunkHeader.newStartLine > 1) {
      return DiffHunkExpansionType.Up
    } else {
      return DiffHunkExpansionType.None
    }
  } else if (distanceToPrevious <= DefaultDiffExpansionStep) {
    return DiffHunkExpansionType.Short
  } else {
    return DiffHunkExpansionType.Both
  }
}

/**
 * Expands a text diff completely.
 *
 * @param diff            Original text diff to expand.
 * @param newContentLines Array with all the lines of the new content.
 */
export function expandWholeTextDiff(
  diff: ITextDiff,
  newContentLines: ReadonlyArray<string>
): ITextDiff | undefined {
  let result = diff

  // The logic is to keep expanding the first hunk until it's the only one.
  // First expand the first hunk up, and then down as many times as possible.
  // If there is only one hunk, just expand it once up.
  while (
    result.hunks.length > 1 ||
    (result.hunks.length === 1 &&
      result.hunks[0].expansionType === DiffHunkExpansionType.Up)
  ) {
    const firstHunk = result.hunks[0]

    const partialResult = expandTextDiffHunk(
      result,
      firstHunk,
      firstHunk.expansionType === DiffHunkExpansionType.Up ? 'up' : 'down',
      newContentLines,
      newContentLines.length
    )

    if (partialResult === undefined) {
      return
    }

    result = partialResult
  }

  return result
}

/**
 * Expands a hunk in a text diff. Returns the new diff with the expanded hunk,
 * or undefined if anything went wrong.
 *
 * @param diff            Original text diff to expand.
 * @param hunk            Specific hunk in the original diff to expand.
 * @param kind            Kind of expansion (up or down).
 * @param newContentLines Array with all the lines of the new content.
 * @param step            How many lines it will be expanded.
 */
export function expandTextDiffHunk(
  diff: ITextDiff,
  hunk: DiffHunk,
  kind: DiffExpansionKind,
  newContentLines: ReadonlyArray<string>,
  step: number = DefaultDiffExpansionStep
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

  const newLineNumber = hunk.header.newStartLine
  const oldLineNumber = hunk.header.oldStartLine

  // Calculate the range of new lines to add to the diff. We could use new or
  // old line number indistinctly, so I chose the new lines.
  let [from, to] = isExpandingUp
    ? [newLineNumber - step, newLineNumber]
    : [
        newLineNumber + hunk.header.newLineCount,
        newLineNumber + hunk.header.newLineCount + step,
      ]

  // We will merge the current hunk with the adjacent only if the expansion
  // ends where the adjacent hunk begins (depending on the expansion direction).
  // In any case, never let the expanded hunk to overlap the adjacent hunk.
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
        const downLimit = adjacentHunk.header.newStartLine
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
      // This null means this line doesn't exist in the original line
      null,
      newOldLineNumber,
      newNewLineNumber,
      false
    )
  })

  // Look for hidden bidi chars in the new lines, if the diff didn't have any already
  const hasHiddenBidiChars =
    diff.hasHiddenBidiChars ||
    newLines.some(line => HiddenBidiCharsRegex.test(line))

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

  // Grab the header line of the hunk to expand
  const firstHunkLine = hunk.lines[0]

  // Create a new Hunk header line
  const newDiffHunkLine = new DiffLine(
    newHunkHeader.toDiffLineRepresentation(),
    DiffLineType.Hunk,
    null,
    firstHunkLine.oldLineNumber,
    firstHunkLine.newLineNumber,
    firstHunkLine.noTrailingNewLine
  )

  const allHunkLinesButFirst = hunk.lines.slice(1)

  // Update the diff lines of the hunk with the new lines
  const updatedHunkLines = isExpandingUp
    ? [newDiffHunkLine, ...newLineDiffs, ...allHunkLinesButFirst]
    : [newDiffHunkLine, ...allHunkLinesButFirst, ...newLineDiffs]

  let numberOfNewDiffLines = updatedHunkLines.length - hunk.lines.length

  const previousHunk = hunkIndex === 0 ? null : diff.hunks[hunkIndex - 1]
  const expansionType = getHunkHeaderExpansionType(
    hunkIndex,
    newHunkHeader,
    previousHunk
  )

  // Update the hunk with all the new info (header, lines, start/end...)
  let updatedHunk = new DiffHunk(
    newHunkHeader,
    updatedHunkLines,
    hunk.unifiedDiffStart,
    hunk.unifiedDiffEnd + numberOfNewDiffLines,
    expansionType
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
      : diff.hunks.slice(followingHunksStartIndex).map((hunk, hunkIndex) => {
          const isLastDummyHunk =
            hunkIndex + followingHunksStartIndex === diff.hunks.length - 1 &&
            hunk.lines.length === 1 &&
            hunk.lines[0].type === DiffLineType.Hunk

          // Only compute the new expansion type if the hunk is the first one
          // (of the remaining hunks) and it's not the last dummy hunk.
          const shouldComputeNewExpansionType =
            hunkIndex === 0 && !isLastDummyHunk

          return new DiffHunk(
            hunk.header,
            hunk.lines,
            hunk.unifiedDiffStart + numberOfNewDiffLines,
            hunk.unifiedDiffEnd + numberOfNewDiffLines,
            // If it's the first hunk after the one we expanded, recalculate
            // its expansion type.
            shouldComputeNewExpansionType
              ? getHunkHeaderExpansionType(
                  followingHunksStartIndex,
                  hunk.header,
                  updatedHunk
                )
              : hunk.expansionType
          )
        })

  // Create the new list of hunks of the diff, and the new diff text
  const newHunks = [...previousHunks, updatedHunk, ...followingHunks]
  const newDiffText = getDiffTextFromHunks(newHunks)

  return {
    ...diff,
    text: newDiffText,
    hunks: newHunks,
    maxLineNumber: getLargestLineNumber(newHunks),
    hasHiddenBidiChars,
  }
}

/**
 * Calculates a new text diff, if needed, with a dummy hunk at the end to allow
 * expansion of the diff at the bottom.
 * If such dummy hunk at the bottom is not needed, returns null.
 *
 * @param diff              Original diff
 * @param hunks             Hunks from the original diff
 * @param numberOfOldLines  Number of lines in the old content
 * @param numberOfNewLines  Number of lines in the new content
 */
export function getTextDiffWithBottomDummyHunk(
  diff: ITextDiff,
  hunks: ReadonlyArray<DiffHunk>,
  numberOfOldLines: number,
  numberOfNewLines: number
): ITextDiff | null {
  const lastHunk = hunks.at(-1)

  if (lastHunk === undefined) {
    return null
  }

  // If the last hunk doesn't reach the end of the file, create a dummy hunk
  // at the end to allow expanding the diff down.
  const lastHunkNewLine =
    lastHunk.header.newStartLine + lastHunk.header.newLineCount

  if (lastHunkNewLine >= numberOfNewLines) {
    return null
  }
  const dummyOldStartLine =
    lastHunk.header.oldStartLine + lastHunk.header.oldLineCount
  const dummyNewStartLine =
    lastHunk.header.newStartLine + lastHunk.header.newLineCount
  const dummyHeader = new DiffHunkHeader(
    dummyOldStartLine,
    numberOfOldLines - dummyOldStartLine + 1,
    dummyNewStartLine,
    numberOfNewLines - dummyNewStartLine + 1
  )
  // Use an empty line for this dummy hunk to keep the diff clean
  const dummyLine = new DiffLine('', DiffLineType.Hunk, null, null, null, false)
  const dummyHunk = new DiffHunk(
    dummyHeader,
    [dummyLine],
    lastHunk.unifiedDiffEnd + 1,
    lastHunk.unifiedDiffEnd + 1,
    DiffHunkExpansionType.Down
  )

  const newHunks = [...hunks, dummyHunk]

  return {
    ...diff,
    text: getDiffTextFromHunks(newHunks),
    hunks: newHunks,
  }
}
