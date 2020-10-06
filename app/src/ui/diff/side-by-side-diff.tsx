import * as React from 'react'
import { Repository } from '../../models/repository'
import {
  ITextDiff,
  DiffLineType,
  DiffHunk,
  DiffLine,
  DiffSelection,
} from '../../models/diff'
import {
  getLineFilters,
  getFileContents,
  highlightContents,
} from './syntax-highlighting'
import { ITokens, ILineTokens } from '../../lib/highlighter/types'
import {
  assertNever,
  assertNonNullable,
  forceUnwrap,
} from '../../lib/fatal-error'
import classNames from 'classnames'
import {
  List,
  AutoSizer,
  CellMeasurerCache,
  CellMeasurer,
  ListRowProps,
} from 'react-virtualized'
import { SideBySideDiffRow } from './side-by-side-diff-row'
import memoize from 'memoize-one'
import { findInteractiveDiffRange, DiffRangeType } from './diff-explorer'
import {
  ChangedFile,
  DiffRow,
  DiffRowType,
  IDiffRowData,
  canSelect,
  getDiffTokens,
} from './diff-helpers'
import { showContextualMenu } from '../main-process-proxy'
import { getTokens } from './diff-syntax-mode'

const DefaultRowHeight = 20
const MaxLineLengthToCalculateDiff = 240

export interface ISelection {
  readonly from: number
  readonly to: number
  readonly isSelected: boolean
}

interface ISideBySideDiffProps {
  readonly repository: Repository

  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  /** The diff that should be rendered */
  readonly diff: ITextDiff

  /**
   * Called when the includedness of lines or a range of lines has changed.
   * Only applicable when readOnly is false.
   */
  readonly onIncludeChanged?: (diffSelection: DiffSelection) => void

  /**
   * Called when the user wants to discard a selection of the diff.
   * Only applicable when readOnly is false.
   */
  readonly onDiscardChanges?: (
    diff: ITextDiff,
    diffSelection: DiffSelection
  ) => void

  /**
   * Whether we'll show a confirmation dialog when the user
   * discards changes.
   */
  readonly askForConfirmationOnDiscardChanges?: boolean

  /**
   * Whether we'll show the diff in a side-by-side layour.
   */
  readonly showSideBySideDiff: boolean
}

interface ISideBySideDiffState {
  /**
   * The list of syntax highlighting tokens corresponding to
   * the previous contents of the file.
   */
  readonly beforeTokens?: ITokens
  /**
   * The list of syntax highlighting tokens corresponding to
   * the next contents of the file.
   */
  readonly afterTokens?: ITokens

  /**
   * Indicates whether the user is doing a text selection and in which
   * column is doing it. This allows us to limit text selection to that
   * specific column via CSS.
   */
  readonly selectingTextInRow?: 'before' | 'after'

  /**
   * The current diff selection. This is used while
   * dragging the mouse over different lines to know where the user started
   * dragging and whether the selection is to add or remove lines from the
   * selection.
   **/
  readonly temporarySelection?: ISelection

  /**
   * Indicates the hunk that the user is currently hovering via the gutter.
   *
   * In this context, a hunk is not exactly equivalent to a diff hunk, but
   * instead marks a group of consecutive added/deleted lines.
   *
   * As an example, the following diff will contain a single diff hunk
   * (marked by the line starting with @@) but in this context we'll have two
   * hunks:
   *
   * |  @@ -1,4 +1,4 @@
   * |  line 1
   * |  -line 2
   * |  +line 2a
   * |  line 3
   * |  -line 4
   * |  +line 4a
   *
   * This differenciation makes selecting multiple lines by clicking on the
   * gutter more user friendly, since only consecutive modified lines get selected.
   */
  readonly hoveredHunk?: number
}

const listRowsHeightCache = new CellMeasurerCache({
  defaultHeight: DefaultRowHeight,
  fixedWidth: true,
})

export class SideBySideDiff extends React.Component<
  ISideBySideDiffProps,
  ISideBySideDiffState
> {
  public constructor(props: ISideBySideDiffProps) {
    super(props)

    this.state = {}
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()
  }

  public componentDidUpdate(prevProps: ISideBySideDiffProps) {
    if (!highlightParametersEqual(this.props, prevProps)) {
      this.initDiffSyntaxMode()
      this.clearListRowsHeightCache()
    }
  }

  public render() {
    return (
      <div
        className={classNames([
          {
            'side-by-side-diff-container': true,
            'unified-diff': !this.props.showSideBySideDiff,
            [`selecting-${this.state.selectingTextInRow}`]:
              this.props.showSideBySideDiff &&
              this.state.selectingTextInRow !== undefined,
            editable: canSelect(this.props.file),
          },
        ])}
        onMouseDown={this.onMouseDown}
      >
        <div className="side-by-side-diff cm-s-default">
          <AutoSizer onResize={this.clearListRowsHeightCache}>
            {({ height, width }) => (
              <List
                deferredMeasurementCache={listRowsHeightCache}
                width={width}
                height={height}
                rowCount={
                  getDiffRows(
                    this.props.diff,
                    this.props.showSideBySideDiff,
                    this.getSelection(),
                    this.state.temporarySelection,
                    this.state.beforeTokens,
                    this.state.afterTokens
                  ).length
                }
                rowHeight={this.getRowHeight}
                rowRenderer={this.renderRow}
                // The following properties are passed to the list
                // to make sure that it gets re-rendered when any of
                // them change.
                showSideBySideDiff={this.props.showSideBySideDiff}
                beforeTokens={this.state.beforeTokens}
                afterTokens={this.state.afterTokens}
                temporarySelection={this.state.temporarySelection}
                hoveredHunk={this.state.hoveredHunk}
                isSelectable={canSelect(this.props.file)}
                fileSelection={this.getSelection()}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    )
  }

  private renderRow = ({ index, parent, style, key }: ListRowProps) => {
    const rows = getDiffRows(
      this.props.diff,
      this.props.showSideBySideDiff,
      this.getSelection(),
      this.state.temporarySelection,
      this.state.beforeTokens,
      this.state.afterTokens
    )
    const row = rows[index]

    if (row === undefined) {
      return null
    }

    const isHunkHovered =
      'hunkStartLine' in row && this.state.hoveredHunk === row.hunkStartLine

    return (
      <CellMeasurer
        cache={listRowsHeightCache}
        columnIndex={0}
        key={key}
        overscanRowCount={10}
        parent={parent}
        rowIndex={index}
      >
        <div key={key} style={style}>
          <SideBySideDiffRow
            row={row}
            isDiffSelectable={canSelect(this.props.file)}
            isHunkHovered={isHunkHovered}
            showSideBySideDiff={this.props.showSideBySideDiff}
            onStartSelection={this.onStartSelection}
            onUpdateSelection={this.onUpdateSelection}
            onMouseEnterHunk={this.onMouseEnterHunk}
            onMouseLeaveHunk={this.onMouseLeaveHunk}
            onClickHunk={this.onClickHunk}
            onContextMenuLine={this.onContextMenuLine}
            onContextMenuHunk={this.onContextMenuHunk}
            onContextMenuText={this.onContextMenuText}
          />
        </div>
      </CellMeasurer>
    )
  }

  private getRowHeight = (row: { index: number }) => {
    return listRowsHeightCache.rowHeight(row) ?? DefaultRowHeight
  }

  private clearListRowsHeightCache = () => {
    listRowsHeightCache.clearAll()
  }

  private async initDiffSyntaxMode() {
    const { file, diff, repository } = this.props

    // Store the current props to that we can see if anything
    // changes from underneath us as we're making asynchronous
    // operations that makes our data stale or useless.
    const propsSnapshot = this.props

    const lineFilters = getLineFilters(diff.hunks)
    const tabSize = 4

    const contents = await getFileContents(repository, file, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    const tokens = await highlightContents(contents, tabSize, lineFilters)

    if (!highlightParametersEqual(this.props, propsSnapshot)) {
      return
    }

    this.setState({
      beforeTokens: tokens.oldTokens,
      afterTokens: tokens.newTokens,
    })
  }

  private getSelection(): DiffSelection | undefined {
    return canSelect(this.props.file) ? this.props.file.selection : undefined
  }

  /**
   * This handler is used to limit text selection to a single column.
   * To do so, we store the last column where the user clicked and use
   * that information to add a CSS class on the container div
   * (e.g `selecting-before`).
   *
   * Then, via CSS we can disable text selection on the column that is
   * not being selected.
   */
  private onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!this.props.showSideBySideDiff) {
      return
    }

    // We need to use the event target since the current target will
    // always point to the container.
    const target = event.target as HTMLDivElement

    const isSelectingBeforeText = target.closest('.before')
    const isSelectingAfterText = target.closest('.after')

    if (isSelectingBeforeText !== null) {
      this.setState({ selectingTextInRow: 'before' })
    } else if (isSelectingAfterText !== null) {
      this.setState({ selectingTextInRow: 'after' })
    }
  }

  private onStartSelection = (lineNumber: number, select: boolean) => {
    this.setState({
      temporarySelection: {
        from: lineNumber,
        to: lineNumber,
        isSelected: select,
      },
    })

    document.addEventListener('mouseup', this.onEndSelection, { once: true })
  }

  private onUpdateSelection = (lineNumber: number) => {
    if (this.state.temporarySelection === undefined) {
      return
    }

    this.setState({
      temporarySelection: {
        ...this.state.temporarySelection,
        to: lineNumber,
      },
    })
  }

  private onEndSelection = () => {
    const selection = this.getSelection()
    if (selection === undefined) {
      return
    }

    if (this.state.temporarySelection === undefined) {
      return
    }

    if (this.props.onIncludeChanged === undefined) {
      return
    }

    const from = Math.min(
      this.state.temporarySelection.from,
      this.state.temporarySelection.to
    )
    const to = Math.max(
      this.state.temporarySelection.from,
      this.state.temporarySelection.to
    )

    this.props.onIncludeChanged(
      selection.withRangeSelection(
        from,
        to - from + 1,
        this.state.temporarySelection.isSelected
      )
    )

    this.setState({
      temporarySelection: undefined,
    })
  }

  private onMouseEnterHunk = (hunkStartLine: number) => {
    if (this.state.temporarySelection !== undefined) {
      return
    }

    this.setState({ hoveredHunk: hunkStartLine })
  }

  private onMouseLeaveHunk = () => {
    this.setState({ hoveredHunk: undefined })
  }

  private onClickHunk = (hunkStartLine: number, select: boolean) => {
    const selection = this.getSelection()
    if (selection === undefined) {
      return
    }

    const range = findInteractiveDiffRange(this.props.diff.hunks, hunkStartLine)
    if (range === null) {
      return
    }

    const { from, to } = range

    if (this.props.onIncludeChanged === undefined) {
      return
    }

    this.props.onIncludeChanged(
      selection.withRangeSelection(from, to - from + 1, select)
    )
  }

  /**
   * Handler to show a context menu when the user right-clicks on the diff text.
   */
  private onContextMenuText = () => {
    const selectionLength = window.getSelection()?.toString().length ?? 0

    showContextualMenu([
      {
        label: 'Copy',
        // When using role="copy", the enabled attribute is not taken into account.
        role: selectionLength > 0 ? 'copy' : undefined,
        enabled: selectionLength > 0,
      },
    ])
  }

  /**
   * Handler to show a context menu when the user right-clicks on a line number.
   *
   * @param diffLineNumber the line number the diff where the user clicked
   */
  private onContextMenuLine = (diffLineNumber: number) => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.props.onDiscardChanges === undefined) {
      return
    }

    const range = findInteractiveDiffRange(
      this.props.diff.hunks,
      diffLineNumber
    )
    if (range?.type == null) {
      return
    }

    showContextualMenu([
      {
        label: this.getDiscardLabel(range.type, 1),
        action: () => this.onDiscardChanges(diffLineNumber),
      },
    ])
  }

  /**
   * Handler to show a context menu when the user right-clicks on the gutter hunk handler.
   *
   * @param hunkStartLine The start line of the hunk where the user clicked.
   */
  private onContextMenuHunk = (hunkStartLine: number) => {
    if (!canSelect(this.props.file)) {
      return
    }

    if (this.props.onDiscardChanges === undefined) {
      return
    }

    const range = findInteractiveDiffRange(this.props.diff.hunks, hunkStartLine)
    if (range?.type == null) {
      return
    }

    showContextualMenu([
      {
        label: this.getDiscardLabel(range.type, range.to - range.from + 1),
        action: () => this.onDiscardChanges(range.from, range.to),
      },
    ])
  }

  private getDiscardLabel(rangeType: DiffRangeType, numLines: number): string {
    const suffix = this.props.askForConfirmationOnDiscardChanges ? '…' : ''
    let type = ''

    if (rangeType === DiffRangeType.Additions) {
      type = __DARWIN__ ? 'Added' : 'added'
    } else if (rangeType === DiffRangeType.Deletions) {
      type = __DARWIN__ ? 'Removed' : 'removed'
    } else if (rangeType === DiffRangeType.Mixed) {
      type = __DARWIN__ ? 'Modified' : 'modified'
    } else {
      assertNever(rangeType, `Invalid range type: ${rangeType}`)
    }

    const plural = numLines > 1 ? 's' : ''
    return __DARWIN__
      ? `Discard ${type} Line${plural}${suffix}`
      : `Discard ${type} line${plural}${suffix}`
  }

  private onDiscardChanges(startLine: number, endLine: number = startLine) {
    const selection = this.getSelection()
    if (selection === undefined) {
      return
    }

    if (this.props.onDiscardChanges === undefined) {
      return
    }

    const newSelection = selection
      .withSelectNone()
      .withRangeSelection(startLine, endLine - startLine + 1, true)

    this.props.onDiscardChanges(this.props.diff, newSelection)
  }
}

/**
 * Checks to see if any key parameters in the props object that are used
 * when performing highlighting has changed. This is used to determine
 * whether highlighting should abort in between asynchronous operations
 * due to some factor (like which file is currently selected) have changed
 * and thus rendering the in-flight highlighting data useless.
 */
function highlightParametersEqual(
  newProps: ISideBySideDiffProps,
  prevProps: ISideBySideDiffProps
) {
  return (
    newProps === prevProps ||
    (newProps.file.id === prevProps.file.id &&
      newProps.diff.text === prevProps.diff.text &&
      newProps.showSideBySideDiff === prevProps.showSideBySideDiff)
  )
}

/**
 * Memoized function to calculate the actual rows to display side by side
 * as a diff.
 *
 * @param diff                The diff to use to calculate the rows.
 * @param showSideBySideDiff  Whether or not show the diff in side by side mode.
 * @param selection           The currently active selection
 *                            (undefined when displaying non-selectable diffs).
 * @param temporarySelection  The in-progress selection that's happening while
 *                            the user drags their mouse to modify the active
 *                            selection.
 * @param beforeTokens        Syntax highlighting tokens for the previous
 *                            version of the file.
 * @param afterTokens         Syntax highlighting tokens for the next version
 *                            of the file.
 */
const getDiffRows = memoize(function (
  diff: ITextDiff,
  showSideBySideDiff: boolean,
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined,
  beforeTokens: ITokens | undefined,
  afterTokens: ITokens | undefined
): DiffRow[] {
  const outputRows: DiffRow[] = []

  for (const hunk of diff.hunks) {
    const rows = getDiffRowsFromHunk(
      hunk,
      showSideBySideDiff,
      selection,
      temporarySelection,
      beforeTokens,
      afterTokens
    )

    for (const row of rows) {
      outputRows.push(row)
    }
  }

  return outputRows
})

/**
 * Returns an array of rows with the needed data to render a side-by-side diff
 * with them.
 *
 * In some situations it will merge a deleted an added row into a single
 * modified row, in order to display them side by side (This happens when there
 * are consecutive added and deleted rows).
 *
 * @param hunk                The hunk to use to extract the rows data
 * @param showSideBySideDiff  Whether or not show the diff in side by side mode.
 * @param selection           The currently active selection
 *                            (undefined when displaying non-selectable diffs).
 * @param temporarySelection  The in-progress selection that's happening while
 *                            the user drags their mouse to modify the active
 *                            selection.
 * @param beforeTokens        Syntax highlighting tokens for the previous
 *                            version of the file.
 * @param afterTokens         Syntax highlighting tokens for the next version
 *                            of the file.
 */
function getDiffRowsFromHunk(
  hunk: DiffHunk,
  showSideBySideDiff: boolean,
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined,
  beforeTokens: ITokens | undefined,
  afterTokens: ITokens | undefined
): DiffRow[] {
  const rows: DiffRow[] = []

  /**
   * Array containing multiple consecutive added/deleted lines. This
   * is used to be able to merge them into modified rows.
   */
  let modifiedLines: {
    line: DiffLine
    diffLineNumber: number
  }[] = []

  for (const [num, line] of hunk.lines.entries()) {
    if (line.type === DiffLineType.Delete || line.type === DiffLineType.Add) {
      modifiedLines.push({
        line,
        diffLineNumber: hunk.unifiedDiffStart + num,
      })
      continue
    }

    if (modifiedLines.length > 0) {
      // If the current line is not added/deleted and we have any added/deleted
      // line stored, we need to process them.
      const modifiedRows = getModifiedRows(
        modifiedLines,
        showSideBySideDiff,
        selection,
        temporarySelection,
        beforeTokens,
        afterTokens
      )
      for (const row of modifiedRows) {
        rows.push(row)
      }

      modifiedLines = []
    }

    if (line.type === DiffLineType.Hunk) {
      rows.push({
        type: DiffRowType.Hunk,
        content: line.content,
      })
      continue
    }

    if (line.type === DiffLineType.Context) {
      assertNonNullable(
        line.oldLineNumber,
        `Expecting oldLineNumber value for ${line}`
      )
      assertNonNullable(
        line.newLineNumber,
        `Expecting newLineNumber value for ${line}`
      )

      let tokens = getTokens(line.oldLineNumber, beforeTokens)

      // Because getLineFilters() sometimes only calculates syntax highlighting
      // in one version of the file (depending in whether the diff has only additions
      // or deletions) we need to check both the before and after tokens.
      if (tokens === null) {
        tokens = getTokens(line.newLineNumber, afterTokens)
      }

      rows.push({
        type: DiffRowType.Context,
        content: line.content,
        beforeLineNumber: line.oldLineNumber,
        afterLineNumber: line.newLineNumber,
        tokens: tokens ? [tokens] : [],
      })
      continue
    }

    assertNever(line.type, `Invalid line type: ${line.type}`)
  }

  // Do one more pass to process the remaining list of modified lines.
  if (modifiedLines.length > 0) {
    const modifiedRows = getModifiedRows(
      modifiedLines,
      showSideBySideDiff,
      selection,
      temporarySelection,
      beforeTokens,
      afterTokens
    )
    for (const row of modifiedRows) {
      rows.push(row)
    }
  }

  return rows
}

function getModifiedRows(
  addedDeletedLines: ReadonlyArray<{
    line: DiffLine
    diffLineNumber: number
  }>,
  showSideBySideDiff: boolean,
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined,
  beforeTokens: ITokens | undefined,
  afterTokens: ITokens | undefined
): ReadonlyArray<DiffRow> {
  if (addedDeletedLines.length === 0) {
    return []
  }
  const hunkStartLine = addedDeletedLines[0].diffLineNumber

  const addedLines = addedDeletedLines.filter(
    ({ line }) => line.type === DiffLineType.Add
  )
  const deletedLines = addedDeletedLines.filter(
    ({ line }) => line.type === DiffLineType.Delete
  )

  const output: Array<DiffRow> = []

  const diffTokensBefore: Array<ILineTokens | undefined> = []
  const diffTokensAfter: Array<ILineTokens | undefined> = []

  // To match the behavior of github.com, we only highlight differences between
  // lines on hunks that have the same number of added and deleted lines.
  const shouldDisplayDiffInChunk = addedLines.length === deletedLines.length

  if (shouldDisplayDiffInChunk) {
    for (let i = 0; i < deletedLines.length; i++) {
      const addedLine = addedLines[i]
      const deletedLine = deletedLines[i]

      if (
        addedLine.line.content.length < MaxLineLengthToCalculateDiff &&
        deletedLine.line.content.length < MaxLineLengthToCalculateDiff
      ) {
        const { before, after } = getDiffTokens(
          deletedLine.line.content,
          addedLine.line.content
        )
        diffTokensBefore[i] = before
        diffTokensAfter[i] = after
      }
    }
  }

  while (
    showSideBySideDiff &&
    addedLines.length > 0 &&
    deletedLines.length > 0
  ) {
    const addedLine = forceUnwrap('Unexpected null line', addedLines.shift())
    const deletedLine = forceUnwrap(
      'Unexpected null line',
      deletedLines.shift()
    )

    // Modified lines
    output.push({
      type: DiffRowType.Modified,
      beforeData: getDataFromLine(
        deletedLine,
        'oldLineNumber',
        selection,
        temporarySelection,
        beforeTokens,
        diffTokensBefore.shift()
      ),
      afterData: getDataFromLine(
        addedLine,
        'newLineNumber',
        selection,
        temporarySelection,
        afterTokens,
        diffTokensAfter.shift()
      ),
      hunkStartLine,
    })
  }

  while (deletedLines.length > 0) {
    const line = forceUnwrap('Unexpected null line', deletedLines.shift())

    output.push({
      type: DiffRowType.Deleted,
      data: getDataFromLine(
        line,
        'oldLineNumber',
        selection,
        temporarySelection,
        beforeTokens,
        diffTokensBefore.shift()
      ),
      hunkStartLine,
    })
  }
  while (addedLines.length > 0) {
    const line = forceUnwrap('Unexpected null line', addedLines.shift())

    // Added line
    output.push({
      type: DiffRowType.Added,
      data: getDataFromLine(
        line,
        'newLineNumber',
        selection,
        temporarySelection,
        afterTokens,
        diffTokensAfter.shift()
      ),
      hunkStartLine,
    })
  }

  return output
}

function getDataFromLine(
  { line, diffLineNumber }: { line: DiffLine; diffLineNumber: number },
  lineToUse: 'oldLineNumber' | 'newLineNumber',
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined,
  syntaxTokens: ITokens | undefined,
  diffTokens: ILineTokens | undefined
): IDiffRowData {
  const lineNumber = forceUnwrap(
    `Expecting ${lineToUse} value for ${line}`,
    line[lineToUse]
  )

  const tokens = []

  const lineTokens = getTokens(lineNumber, syntaxTokens)
  if (lineTokens !== null) {
    tokens.push(lineTokens)
  }
  if (diffTokens !== undefined) {
    tokens.push(diffTokens)
  }

  return {
    content: line.content,
    lineNumber,
    diffLineNumber,
    isSelected: isInSelection(diffLineNumber, selection, temporarySelection),
    noNewLineIndicator: line.noTrailingNewLine,
    tokens,
  }
}

function isInSelection(
  diffLineNumber: number,
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined
) {
  const isInStoredSelection = selection?.isSelected(diffLineNumber) || false

  if (temporarySelection === undefined) {
    return isInStoredSelection
  }

  const isInTemporary = isInTemporarySelection(
    diffLineNumber,
    temporarySelection
  )

  if (temporarySelection.isSelected) {
    return isInStoredSelection || isInTemporary
  } else {
    return isInStoredSelection && !isInTemporary
  }
}

export function isInTemporarySelection(
  lineNumber: number,
  selection: ISelection | undefined
): selection is ISelection {
  if (selection === undefined) {
    return false
  }
  return (
    lineNumber >= Math.min(selection.from, selection.to) &&
    lineNumber <= Math.max(selection.to, selection.from)
  )
}
