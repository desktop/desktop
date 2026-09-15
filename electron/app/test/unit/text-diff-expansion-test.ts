import { describe, it } from 'node:test'
import assert from 'node:assert'
import * as path from 'path'
import * as os from 'os'
import { mkdtemp, writeFile } from 'fs/promises'
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
  const contentFolderPath = await mkdtemp(contentFolderPathPrefix)

  await writeFile(path.join(contentFolderPath, 'original'), originalContents)
  await writeFile(path.join(contentFolderPath, 'changed'), modifiedContents)

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
    assert.equal(lastHunk.lines.length, 1)

    const firstLine = lastHunk.lines[0]
    assert.equal(firstLine.type, DiffLineType.Hunk)
    assert.equal(firstLine.text, '')
    assert.equal(firstLine.newLineNumber, null)
    assert.equal(firstLine.oldLineNumber, null)
  })

  it('does not add a dummy hunk to the bottom when last hunk reaches bottom', async () => {
    const { textDiff } = await prepareDiff(100, [99])
    const lastHunk = textDiff.hunks.at(-1)
    assert(lastHunk !== undefined)
    assert.equal(lastHunk.lines.length, 6)
  })

  it('expands the initial hunk without reaching the top', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [30])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[0],
      'up',
      newContentLines
    )

    assert(expandedDiff !== undefined)

    const firstHunk = expandedDiff.hunks[0]
    assert.equal(firstHunk.header.oldStartLine, 8)
    assert.equal(firstHunk.header.oldLineCount, 26)
    assert.equal(firstHunk.header.newStartLine, 8)
    assert.equal(firstHunk.header.newLineCount, 27)

    // Check the first line is still the header info
    assert.equal(firstHunk.lines[0].type, DiffLineType.Hunk)
  })

  it('expands the initial hunk reaching the top', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [15])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[0],
      'up',
      newContentLines
    )

    assert(expandedDiff !== undefined)

    const firstHunk = expandedDiff.hunks[0]
    assert.equal(firstHunk.header.oldStartLine, 1)
    assert.equal(firstHunk.header.oldLineCount, 18)
    assert.equal(firstHunk.header.newStartLine, 1)
    assert.equal(firstHunk.header.newLineCount, 19)

    // Check the first line is still the header info
    assert.equal(firstHunk.lines[0].type, DiffLineType.Hunk)
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

    assert(expandedDiff !== undefined)

    const secondToLastHunk = expandedDiff.hunks.at(-2)
    assert(secondToLastHunk !== undefined)

    assert.equal(secondToLastHunk.header.oldStartLine, 13)
    assert.equal(secondToLastHunk.header.oldLineCount, 26)
    assert.equal(secondToLastHunk.header.newStartLine, 13)
    assert.equal(secondToLastHunk.header.newLineCount, 27)
  })

  it('expands the second-to-last hunk reaching the bottom', async () => {
    const { textDiff, newContentLines } = await prepareDiff(100, [90])
    const expandedDiff = expandTextDiffHunk(
      textDiff,
      textDiff.hunks[textDiff.hunks.length - 2],
      'down',
      newContentLines
    )
    assert(expandedDiff !== undefined)

    const lastHunk = expandedDiff.hunks.at(-1)
    assert(lastHunk !== undefined)

    assert.equal(lastHunk.header.oldStartLine, 88)
    assert.equal(lastHunk.header.oldLineCount, 13)
    assert.equal(lastHunk.header.newStartLine, 88)
    assert.equal(lastHunk.header.newLineCount, 14)
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
    assert.equal(textDiff.hunks.length, 3)

    assert(expandedDiff !== undefined)

    // After expanding the hunk, the first two hunks are merged
    assert.equal(expandedDiff.hunks.length, 2)

    const firstHunk = expandedDiff.hunks[0]
    assert.equal(firstHunk.header.oldStartLine, 8)
    assert.equal(firstHunk.header.oldLineCount, 16)
    assert.equal(firstHunk.header.newStartLine, 8)
    assert.equal(firstHunk.header.newLineCount, 18)
  })

  it('expands the whole file', async () => {
    const { textDiff, newContentLines } = await prepareDiff(
      35,
      [20, 17, 8, 7, 6]
    )

    const expandedDiff = expandWholeTextDiff(textDiff, newContentLines)
    assert(expandedDiff !== undefined)
    assert.equal(expandedDiff.hunks.length, 1)

    const firstHunk = expandedDiff.hunks[0]
    assert.equal(firstHunk.lines.length, 40 + 1) // +1 for the header

    let expectedNewLine = 1
    let expectedOldLine = 1

    // Make sure line numbers are consecutive as expected
    for (const line of firstHunk.lines) {
      if (line.type === DiffLineType.Add) {
        assert.equal(line.newLineNumber, expectedNewLine)
        expectedNewLine++
      } else if (line.type === DiffLineType.Delete) {
        assert.equal(line.oldLineNumber, expectedOldLine)
        expectedOldLine++
      } else if (line.type === DiffLineType.Context) {
        assert.equal(line.newLineNumber, expectedNewLine)
        expectedNewLine++
        assert.equal(line.oldLineNumber, expectedOldLine)
        expectedOldLine++
      }
    }
  })
})
