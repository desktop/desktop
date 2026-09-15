import assert from 'node:assert'
import { describe, it } from 'node:test'
import * as React from 'react'

import {
  DiffHunkExpansionType,
  DiffSelectionType,
} from '../../../src/models/diff'
import { SideBySideDiffRow } from '../../../src/ui/diff/side-by-side-diff-row'
import {
  DiffColumn,
  DiffRowType,
  type IDiffRowData,
} from '../../../src/ui/diff/diff-helpers'
import { fireEvent, render, screen } from '../../helpers/ui/render'

type SideBySideDiffRowProps = React.ComponentProps<typeof SideBySideDiffRow>

interface IStartedSelection {
  readonly row: number
  readonly column: DiffColumn
  readonly select: boolean
}

interface ILineNumberChange {
  readonly row: number
  readonly column: DiffColumn
  readonly select: boolean
}

interface IHunkClick {
  readonly hunkStartLine: number
  readonly select: boolean
}

interface IHunkExpansion {
  readonly hunkIndex: number
  readonly expansionType: DiffHunkExpansionType
}

function createDiffRowData(
  overrides: Partial<IDiffRowData> = {}
): IDiffRowData {
  return {
    content: 'added line',
    lineNumber: 10,
    diffLineNumber: 1,
    noNewLineIndicator: false,
    isSelected: false,
    tokens: [],
    ...overrides,
  }
}

function createAddedRow(
  dataOverrides: Partial<IDiffRowData> = {}
): SideBySideDiffRowProps['row'] {
  return {
    type: DiffRowType.Added,
    hunkStartLine: 1,
    data: createDiffRowData(dataOverrides),
  }
}

function createModifiedRow(): SideBySideDiffRowProps['row'] {
  return {
    type: DiffRowType.Modified,
    hunkStartLine: 7,
    beforeData: createDiffRowData({
      content: 'before line',
      lineNumber: 10,
      diffLineNumber: 1,
      isSelected: false,
    }),
    afterData: createDiffRowData({
      content: 'after line',
      lineNumber: 11,
      diffLineNumber: 2,
      isSelected: true,
    }),
  }
}

function createSelectableGroup(
  selectionState: DiffSelectionType = DiffSelectionType.None
): NonNullable<SideBySideDiffRowProps['rowSelectableGroup']> {
  return {
    isFirst: true,
    isHovered: false,
    isCheckAllRenderedInRow: true,
    selectionState,
    height: 40,
    staticData: {
      diffRowStartIndex: 0,
      diffRowStopIndex: 1,
      diffType: DiffRowType.Added,
      lineNumbers: [10, 11],
      lineNumbersIdentifiers: ['10-after', '11-after'],
    },
  }
}

function renderSideBySideDiffRow(
  options: Partial<SideBySideDiffRowProps> = {}
) {
  const startedSelections = new Array<IStartedSelection>()
  const lineNumberChanges = new Array<ILineNumberChange>()
  const hunkClicks = new Array<IHunkClick>()
  const hunkExpansions = new Array<IHunkExpansion>()
  const contextMenuLines = new Array<number>()
  const contextMenuHunks = new Array<number>()

  const props: SideBySideDiffRowProps = {
    row: createAddedRow(),
    isDiffSelectable: true,
    showSideBySideDiff: false,
    hideWhitespaceInDiff: false,
    lineNumberWidth: 3,
    numRow: 0,
    onStartSelection: (row, column, select) => {
      startedSelections.push({ row, column, select })
    },
    onMouseEnterHunk: () => {},
    onMouseLeaveHunk: () => {},
    onExpandHunk: (hunkIndex, expansionType) => {
      hunkExpansions.push({ hunkIndex, expansionType })
    },
    onClickHunk: (hunkStartLine, select) => {
      hunkClicks.push({ hunkStartLine, select })
    },
    onContextMenuLine: diffLineNumber => {
      contextMenuLines.push(diffLineNumber)
    },
    onLineNumberCheckedChanged: (row, column, select) => {
      lineNumberChanges.push({ row, column, select })
    },
    onContextMenuHunk: hunkStartLine => {
      contextMenuHunks.push(hunkStartLine)
    },
    onContextMenuExpandHunk: () => {},
    beforeClassNames: [],
    afterClassNames: [],
    onHideWhitespaceInDiffChanged: () => {},
    onHunkExpansionRef: () => {},
    showDiffCheckMarks: false,
    rowSelectableGroup: null,
    ...options,
  }

  render(<SideBySideDiffRow {...props} />)

  return {
    startedSelections,
    lineNumberChanges,
    hunkClicks,
    hunkExpansions,
    contextMenuLines,
    contextMenuHunks,
  }
}

function getLineNumberGutter(lineNumber: string) {
  const lineNumberElement = screen.getByText(lineNumber)
  const lineNumberGutter = lineNumberElement.closest('.line-number')

  if (!(lineNumberGutter instanceof HTMLElement)) {
    throw new Error(`Could not find gutter for line ${lineNumber}`)
  }

  return lineNumberGutter
}

function getLineNumberLabel(lineNumber: string) {
  const lineNumberElement = screen.getByText(lineNumber)
  const lineNumberLabel = lineNumberElement.closest('label')

  if (!(lineNumberLabel instanceof HTMLElement)) {
    throw new Error(`Could not find label for line ${lineNumber}`)
  }

  return lineNumberLabel
}

describe('SideBySideDiffRow', () => {
  it('starts line selection on primary-button mousedown events', () => {
    const { startedSelections } = renderSideBySideDiffRow()

    fireEvent.mouseDown(getLineNumberGutter('10'), { button: 0, buttons: 1 })

    assert.deepEqual(startedSelections, [
      { row: 0, column: DiffColumn.After, select: true },
    ])
  })

  it('starts line deselection when the line is already selected', () => {
    const { startedSelections } = renderSideBySideDiffRow({
      row: createAddedRow({ isSelected: true }),
    })

    fireEvent.mouseDown(getLineNumberGutter('10'), { button: 0, buttons: 1 })

    assert.deepEqual(startedSelections, [
      { row: 0, column: DiffColumn.After, select: false },
    ])
  })

  it('ignores non-primary mousedown events on line gutters', () => {
    const { startedSelections } = renderSideBySideDiffRow()
    const lineNumberGutter = getLineNumberGutter('10')

    fireEvent.mouseDown(lineNumberGutter, { button: 1, buttons: 4 })
    fireEvent.mouseDown(lineNumberGutter, { button: 2, buttons: 2 })

    assert.deepEqual(startedSelections, [])
  })

  it('infers the modified row column from the clicked line gutter', () => {
    const { startedSelections } = renderSideBySideDiffRow({
      row: createModifiedRow(),
      showSideBySideDiff: true,
    })

    fireEvent.mouseDown(getLineNumberGutter('10'), { button: 0, buttons: 1 })
    fireEvent.mouseDown(getLineNumberGutter('11'), { button: 0, buttons: 1 })

    assert.deepEqual(startedSelections, [
      { row: 0, column: DiffColumn.Before, select: true },
      { row: 0, column: DiffColumn.After, select: false },
    ])
  })

  it('dispatches line number checkbox changes with row and column', () => {
    const { lineNumberChanges } = renderSideBySideDiffRow()

    const checkbox = screen.getByRole('checkbox', {
      name: /Line 10 added/,
    })

    fireEvent.click(checkbox)

    assert.deepEqual(lineNumberChanges, [
      { row: 0, column: DiffColumn.After, select: true },
    ])
  })

  it('dispatches context menus from line number labels with diff line numbers', () => {
    const { contextMenuLines } = renderSideBySideDiffRow()

    fireEvent.contextMenu(getLineNumberLabel('10'))

    assert.deepEqual(contextMenuLines, [1])
  })

  it('dispatches hunk checkbox changes with the hunk start line', () => {
    const { hunkClicks } = renderSideBySideDiffRow({
      rowSelectableGroup: createSelectableGroup(),
    })

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Lines 10 to 11 added/ })
    )

    assert.deepEqual(hunkClicks, [{ hunkStartLine: 1, select: true }])
  })

  it('dispatches hunk checkbox changes as deselection when the row is selected', () => {
    const { hunkClicks } = renderSideBySideDiffRow({
      row: createAddedRow({ isSelected: true }),
      rowSelectableGroup: createSelectableGroup(DiffSelectionType.All),
    })

    fireEvent.click(
      screen.getByRole('checkbox', { name: /Lines 10 to 11 added/ })
    )

    assert.deepEqual(hunkClicks, [{ hunkStartLine: 1, select: false }])
  })

  it('dispatches context menus from hunk handles with the hunk start line', () => {
    const { contextMenuHunks } = renderSideBySideDiffRow({
      rowSelectableGroup: createSelectableGroup(),
    })

    fireEvent.contextMenu(
      screen.getByText(/Lines 10 to 11 added/).closest('.hunk-handle') ??
        screen.getByText(/Lines 10 to 11 added/)
    )

    assert.deepEqual(contextMenuHunks, [1])
  })

  it('dispatches hunk expansion clicks with the expansion type', () => {
    const { hunkExpansions } = renderSideBySideDiffRow({
      row: {
        type: DiffRowType.Hunk,
        content: '@@ -1 +1 @@',
        expansionType: DiffHunkExpansionType.Up,
        hunkIndex: 2,
      },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Expand Up' }))

    assert.deepEqual(hunkExpansions, [
      { hunkIndex: 2, expansionType: DiffHunkExpansionType.Up },
    ])
  })
})
