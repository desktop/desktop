import { describe, it } from 'node:test'
import assert from 'node:assert'
import {
  formatDiffForClipboard,
  formatDiffsForClipboard,
} from '../../src/lib/format-diff-for-clipboard'
import {
  DiffHunk,
  DiffHunkExpansionType,
  DiffHunkHeader,
  DiffLine,
  DiffLineType,
  DiffType,
  ITextDiff,
} from '../../src/models/diff'

function makeTextDiff(
  lines: ReadonlyArray<{ type: DiffLineType; content: string }>
): ITextDiff {
  const diffLines = lines.map(
    (line, index) =>
      new DiffLine(
        line.type === DiffLineType.Add
          ? `+${line.content}`
          : line.type === DiffLineType.Delete
          ? `-${line.content}`
          : line.type === DiffLineType.Context
          ? ` ${line.content}`
          : line.content,
        line.type,
        index,
        line.type === DiffLineType.Add ? null : index + 1,
        line.type === DiffLineType.Delete ? null : index + 1
      )
  )

  const hunk = new DiffHunk(
    new DiffHunkHeader(1, diffLines.length, 1, diffLines.length),
    diffLines,
    0,
    diffLines.length,
    DiffHunkExpansionType.None
  )

  return {
    kind: DiffType.Text,
    text: diffLines.map(l => l.text).join('\n'),
    hunks: [hunk],
    maxLineNumber: diffLines.length,
    hasHiddenBidiChars: false,
  }
}

describe('formatDiffForClipboard', () => {
  it('formats removed and added lines for a text diff', () => {
    const diff = makeTextDiff([
      { type: DiffLineType.Context, content: 'unchanged' },
      { type: DiffLineType.Delete, content: 'old line' },
      { type: DiffLineType.Add, content: 'new line' },
      { type: DiffLineType.Context, content: 'also unchanged' },
    ])

    const result = formatDiffForClipboard('src/app.ts', diff)

    assert.equal(
      result,
      ['File: src/app.ts', '', '- old line', '+ new line'].join('\n')
    )
  })

  it('returns null for binary diffs', () => {
    assert.equal(
      formatDiffForClipboard('image.png', { kind: DiffType.Binary }),
      null
    )
  })

  it('returns null when there are only context lines', () => {
    const diff = makeTextDiff([
      { type: DiffLineType.Context, content: 'unchanged' },
    ])

    assert.equal(formatDiffForClipboard('src/app.ts', diff), null)
  })

  it('joins multiple files with blank lines', () => {
    const first = makeTextDiff([
      { type: DiffLineType.Delete, content: 'a' },
      { type: DiffLineType.Add, content: 'b' },
    ])
    const second = makeTextDiff([{ type: DiffLineType.Add, content: 'c' }])

    const result = formatDiffsForClipboard([
      { path: 'a.ts', diff: first },
      { path: 'b.ts', diff: second },
    ])

    assert.equal(
      result,
      [
        'File: a.ts',
        '',
        '- a',
        '+ b',
        '',
        'File: b.ts',
        '',
        '+ c',
      ].join('\n')
    )
  })
})
