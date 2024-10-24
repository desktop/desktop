import * as path from 'path'
import * as os from 'os'
import * as FSE from 'fs-extra'
import { exec } from 'dugite'
import { DiffParser } from '../../src/lib/diff-parser'
import {
  expandTextDiffHunk,
  expandWholeTextDiff,
  getTextDiffWithBottomDummyHunk,
} from '../../src/ui/diff/text-diff-expansion'
import { ITextDiff, DiffType } from '../../src/models/diff/diff-data'
import { DiffLineType } from '../../src/models/diff'

interface ITestDiffInfo {
  readonly textDiff: ITextDiff
  readonly newContentLines: ReadonlyArray<string>
}

async function prepareDiff(
  numberOfLines: number,
  linesChanged: ReadonlyArray<number>
): Promise<ITestDiffInfo> {
  const textLines = [...Array(numberOfLines).keys()].map(value =>
    value.toString()
  )
  const originalContents = textLines.join('\n')
  for (const line of linesChanged) {
    textLines.splice(line, 0, 'added line')
  }
  const modifiedContents = textLines.join('\n')

  const contentFolderPathPrefix = path.join(
    os.tmpdir(),
    'text-diff-expansion-test'
  )
  const contentFolderPath = await FSE.mkdtemp(contentFolderPathPrefix)

  await FSE.writeFile(
    path.join(contentFolderPath, 'original'),
    originalContents
  )
  await FSE.writeFile(path.join(contentFolderPath, 'changed'), modifiedContents)

  // Generate diff with 3 lines of context
  const result = await exec(
    [
      'diff',
      '-U3',
      path.join(contentFolderPath, 'original'),
      path.join(contentFolderPath, 'changed'),
    ],
    contentFolderPath
  )

  const parser = new DiffParser()
  const diff = parser.parse(result.stdout)
  const textDiff: ITextDiff = {
    kind: DiffType.Text,
    text: diff.contents,
    hunks: diff.hunks,
    maxLineNumber: diff.maxLineNumber,
    hasHiddenBidiChars: diff.hasHiddenBidiChars,
  }

  const resultDiff = getTextDiffWithBottomDummyHunk(
    textDiff,
    textDiff.hunks,
    numberOfLines,
    numberOfLines + linesChanged.length
  )

  return {
    textDiff: resultDiff ?? textDiff,
    newContentLines: textLines,
  }
}

describe('text-diff-expansion', () => {
  it('adds a dummy hunk to the bottom to allow expansion when last hunk does not reach bottom', async () => {
    const { textDiff } = await prepareDiff(100, [30])

    const lastHunk = textDiff.hunks[textDiff.hunks.length - 1]
    expect(lastHunk.lines).toHaveLength(1)

    const firstLine = lastHunk.lines[0]
    expect(firstLine.type).toBe(DiffLineType.Hunk)
    expect(firstLine.text).toBe('')
    expect(firstLine.newLineNumber).toBe(null)
    expect(firstLine.oldLineNumber).toBe(null)
  })

  it('does not add a dummy hunk to the bottom when last hunk reaches bottom', async () => {
    const { textDiff } = await prepareDiff(100, [99])
    expect(textDiff.hunks.at(-1)?.lines).toHaveLength(6)
  })

  it('expands the initial hunk without reaching the top', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [30])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[0],
      'up',
      newContentLines
    )

    const firstHunk = expandedDiff!.hunks[0]
    expect(firstHunk.header.oldStartLine).toBe(8)
    expect(firstHunk.header.oldLineCount).toBe(26)
    expect(firstHunk.header.newStartLine).toBe(8)
    expect(firstHunk.header.newLineCount).toBe(27)

    // Check the first line is still the header info
    expect(firstHunk.lines[0].type).toBe(DiffLineType.Hunk)
  })

  it('expands the initial hunk reaching the top', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [15])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[0],
      'up',
      newContentLines
    )

    const firstHunk = expandedDiff!.hunks[0]
    expect(firstHunk.header.oldStartLine).toBe(1)
    expect(firstHunk.header.oldLineCount).toBe(18)
    expect(firstHunk.header.newStartLine).toBe(1)
    expect(firstHunk.header.newLineCount).toBe(19)

    // Check the first line is still the header info
    expect(firstHunk.lines[0].type).toBe(DiffLineType.Hunk)
  })

  // The last hunk is a dummy hunk to expand the bottom of the diff
  it('expands the second-to-last hunk without reaching the bottom', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [15])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[textDiff.hunks.length - 2],
      'down',
      newContentLines
    )

    const secondToLastHunk = expandedDiff!.hunks[expandedDiff!.hunks.length - 2]
    expect(secondToLastHunk.header.oldStartLine).toBe(13)
    expect(secondToLastHunk.header.oldLineCount).toBe(26)
    expect(secondToLastHunk.header.newStartLine).toBe(13)
    expect(secondToLastHunk.header.newLineCount).toBe(27)
  })

  it('expands the second-to-last hunk reaching the bottom', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [90])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[textDiff.hunks.length - 2],
      'down',
      newContentLines
    )

    const lastHunk = expandedDiff!.hunks[expandedDiff!.hunks.length - 1]
    expect(lastHunk.header.oldStartLine).toBe(88)
    expect(lastHunk.header.oldLineCount).toBe(13)
    expect(lastHunk.header.newStartLine).toBe(88)
    expect(lastHunk.header.newLineCount).toBe(14)
  })

  it('merges hunks when the gap between them is shorter than the expansion size', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [20, 10])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[0],
      'down',
      newContentLines
    )

    // Originally 3 hunks:
    // - First around line 10
    // - Second around line 20
    // - Third is the dummy hunk at the end
    expect(textDiff.hunks).toHaveLength(3)

    // After expanding the hunk, the first two hunks are merged
    expect(expandedDiff!.hunks).toHaveLength(2)

    const firstHunk = expandedDiff!.hunks[0]
    expect(firstHunk.header.oldStartLine).toBe(8)
    expect(firstHunk.header.oldLineCount).toBe(16)
    expect(firstHunk.header.newStartLine).toBe(8)
    expect(firstHunk.header.newLineCount).toBe(18)
  })

  it('expands the whole file', async () => {
    const { textDiff, newContentLines } = await prepareDiff(
      35,
      [20, 17, 8, 7, 6]
    )

    const expandedDiff = expandWholeTextDiff(textDiff, newContentLines)
    expect(expandedDiff!.hunks).toHaveLength(1)

    const firstHunk = expandedDiff!.hunks[0]
    expect(firstHunk.lines).toHaveLength(40 + 1) // +1 for the header

    let expectedNewLine = 1
    let expectedOldLine = 1

    // Make sure line numbers are consecutive as expected
    for (const line of firstHunk.lines) {
      if (line.type === DiffLineType.Add) {
        expect(line.newLineNumber).toBe(expectedNewLine)
        expectedNewLine++
      } else if (line.type === DiffLineType.Delete) {
        expect(line.oldLineNumber).toBe(expectedOldLine)
        expectedOldLine++
      } else if (line.type === DiffLineType.Context) {
        expect(line.newLineNumber).toBe(expectedNewLine)
        expectedNewLine++
        expect(line.oldLineNumber).toBe(expectedOldLine)
        expectedOldLine++
      }
    }
  })
})
