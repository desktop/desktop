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
  canSelect,
  getDiffTokens,
  SimplifiedDiffRowData,
  SimplifiedDiffRow,
  IDiffRowData,
  DiffColumn,
} from './diff-helpers'
import { showContextualMenu } from '../main-process-proxy'
import { getTokens } from './diff-syntax-mode'
import { DiffSearchInput } from './diff-seach-input'
import { escapeRegExp } from '../../lib/helpers/regex'

const DefaultRowHeight = 20
const MaxLineLengthToCalculateDiff = 240

const InitialPosition: ISelectionPosition = {
  row: 0,
  offset: 0,
  diffColumn: DiffColumn.Before,
}

export interface ISelection {
  readonly from: {
    readonly column: DiffColumn
    readonly row: number
  }
  readonly to: {
    readonly column: DiffColumn
    readonly row: number
  }
  readonly isSelected: boolean
}

type ModifiedLine = { line: DiffLine; diffLineNumber: number }
interface ISelectionPosition {
  readonly row: number
  readonly offset: number
  readonly diffColumn: DiffColumn
}
type RowSearchTokens = { [key: string]: ILineTokens }
type SearchTokens = Map<number, RowSearchTokens>

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
   * Whether we'll show the diff in a side-by-side layout.
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
   * This differentiation makes selecting multiple lines by clicking on the
   * gutter more user friendly, since only consecutive modified lines get selected.
   */
  readonly hoveredHunk?: number

  readonly isSearching: boolean

  readonly searchQuery?: string

  readonly searchTokens?: SearchTokens

  readonly selectedSearchResult: ISelectionPosition
}

const listRowsHeightCache = new CellMeasurerCache({
  defaultHeight: DefaultRowHeight,
  fixedWidth: true,
})

export class SideBySideDiff extends React.Component<
  ISideBySideDiffProps,
  ISideBySideDiffState
> {
  private virtualListRef = React.createRef<List>()

  public constructor(props: ISideBySideDiffProps) {
    super(props)

    this.state = {
      isSearching: false,
      selectedSearchResult: InitialPosition,
    }
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()

    window.addEventListener('keydown', this.toggleSearchInput)
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.toggleSearchInput)
    document.removeEventListener('mouseup', this.onEndSelection)
  }

  public componentDidUpdate(prevProps: ISideBySideDiffProps) {
    if (!highlightParametersEqual(this.props, prevProps)) {
      this.initDiffSyntaxMode()
      this.clearListRowsHeightCache()
    }
  }

  public render() {
    const rows = getDiffRows(this.props.diff, this.props.showSideBySideDiff)
    const containerClassName = classNames('side-by-side-diff-container', {
      'unified-diff': !this.props.showSideBySideDiff,
      [`selecting-${this.state.selectingTextInRow}`]:
        this.props.showSideBySideDiff &&
        this.state.selectingTextInRow !== undefined,
      editable: canSelect(this.props.file),
    })

    return (
      <div className={containerClassName} onMouseDown={this.onMouseDown}>
        {this.state.isSearching && (
          <DiffSearchInput
            onSearch={this.onSearch}
            onClose={this.onSearchCancel}
          />
        )}
        <div className="side-by-side-diff cm-s-default">
          <AutoSizer onResize={this.clearListRowsHeightCache}>
            {({ height, width }) => (
              <List
                deferredMeasurementCache={listRowsHeightCache}
                width={width}
                height={height}
                rowCount={rows.length}
                rowHeight={this.getRowHeight}
                rowRenderer={this.renderRow}
                ref={this.virtualListRef}
                // The following properties are passed to the list
                // to make sure that it gets re-rendered when any of
                // them change.
                isSearching={this.state.isSearching}
                selectedSearchResult={this.state.selectedSearchResult}
                searchQuery={this.state.searchQuery}
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
    const rows = getDiffRows(this.props.diff, this.props.showSideBySideDiff)
    const row = rows[index]

    if (row === undefined) {
      return null
    }

    const rowWithTokens = this.createFullRow(row, index)

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
            row={rowWithTokens}
            numRow={index}
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

  private createFullRow(row: SimplifiedDiffRow, numRow: number): DiffRow {
    if (row.type === DiffRowType.Added) {
      return {
        ...row,
        data: this.getRowDataPopulated(
          row.data,
          numRow,
          this.props.showSideBySideDiff ? DiffColumn.After : DiffColumn.Before,
          this.state.afterTokens
        ),
      }
    }

    if (row.type === DiffRowType.Deleted) {
      return {
        ...row,
        data: this.getRowDataPopulated(
          row.data,
          numRow,
          DiffColumn.Before,
          this.state.beforeTokens
        ),
      }
    }

    if (row.type === DiffRowType.Modified) {
      return {
        ...row,
        beforeData: this.getRowDataPopulated(
          row.beforeData,
          numRow,
          DiffColumn.Before,
          this.state.beforeTokens
        ),
        afterData: this.getRowDataPopulated(
          row.afterData,
          numRow,
          DiffColumn.After,
          this.state.afterTokens
        ),
      }
    }

    if (row.type === DiffRowType.Context) {
      const lineTokens =
        getTokens(row.beforeLineNumber, this.state.beforeTokens) ??
        getTokens(row.afterLineNumber, this.state.afterTokens)

      const beforeTokens = [...row.beforeTokens]
      const afterTokens = [...row.afterTokens]

      if (lineTokens !== null) {
        beforeTokens.push(lineTokens)
        afterTokens.push(lineTokens)
      }

      const searchBeforeTokens = this.getSearchTokens(numRow, DiffColumn.Before)
      const searchAfterTokens = this.getSearchTokens(numRow, DiffColumn.After)

      beforeTokens.push(...searchBeforeTokens)
      afterTokens.push(...searchAfterTokens)

      return { ...row, beforeTokens, afterTokens }
    }

    return row
  }

  private getRowDataPopulated(
    data: SimplifiedDiffRowData,
    row: number,
    column: DiffColumn,
    tokens: ITokens | undefined
  ): IDiffRowData {
    const searchTokens = this.getSearchTokens(row, column)
    const lineTokens = getTokens(data.lineNumber, tokens)
    const finalTokens = [...data.tokens]

    if (searchTokens !== null) {
      finalTokens.push(...searchTokens)
    }
    if (lineTokens !== null) {
      finalTokens.push(lineTokens)
    }

    return {
      ...data,
      tokens: finalTokens,
      isSelected: isInSelection(
        data.diffLineNumber,
        row,
        column,
        this.getSelection(),
        this.state.temporarySelection
      ),
    }
  }

  private getSearchTokens(row: number, column: DiffColumn) {
    const { searchTokens, selectedSearchResult } = this.state
    const finalTokens = new Array<ILineTokens>()

    const rowSearchTokens = searchTokens?.get(row)
    const diffColumnTokens =
      rowSearchTokens !== undefined ? rowSearchTokens[column] : undefined

    if (diffColumnTokens === undefined) {
      return finalTokens
    }

    finalTokens.push(diffColumnTokens)
    const tokenAtSearchOffset = diffColumnTokens[selectedSearchResult.offset]

    if (
      selectedSearchResult.row === row &&
      tokenAtSearchOffset !== undefined &&
      column === selectedSearchResult.diffColumn
    ) {
      finalTokens.push({
        [selectedSearchResult.offset]: {
          length: tokenAtSearchOffset.length,
          token: 'selected',
        },
      })
    }

    return finalTokens
  }

  private getDiffLineNumber(
    rowNumber: number,
    column: DiffColumn
  ): number | null {
    const rows = getDiffRows(this.props.diff, this.props.showSideBySideDiff)

    if (rows[rowNumber] === undefined) {
      return null
    }

    const row = rows[rowNumber]

    if (row.type === DiffRowType.Added || row.type === DiffRowType.Deleted) {
      return row.data.diffLineNumber
    }

    if (row.type === DiffRowType.Modified) {
      return column === DiffColumn.After
        ? row.afterData.diffLineNumber
        : row.beforeData.diffLineNumber
    }

    return null
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

    if (!(event.target instanceof HTMLElement)) {
      return
    }

    // We need to use the event target since the current target will
    // always point to the container.
    const isSelectingBeforeText = event.target.closest('.before')
    const isSelectingAfterText = event.target.closest('.after')

    if (isSelectingBeforeText !== null) {
      this.setState({ selectingTextInRow: 'before' })
    } else if (isSelectingAfterText !== null) {
      this.setState({ selectingTextInRow: 'after' })
    }
  }

  private onStartSelection = (
    row: number,
    column: DiffColumn,
    select: boolean
  ) => {
    this.setState({
      temporarySelection: {
        from: { row, column },
        to: { row, column },
        isSelected: select,
      },
    })

    document.addEventListener('mouseup', this.onEndSelection, { once: true })
  }

  private onUpdateSelection = (row: number, column: DiffColumn) => {
    if (this.state.temporarySelection === undefined) {
      return
    }

    this.setState({
      temporarySelection: {
        ...this.state.temporarySelection,
        to: { row, column },
      },
    })
  }

  private onEndSelection = () => {
    let selection = this.getSelection()
    if (selection === undefined) {
      return
    }

    if (this.state.temporarySelection === undefined) {
      return
    }

    if (this.props.onIncludeChanged === undefined) {
      return
    }

    const fromRow = Math.min(
      this.state.temporarySelection.from.row,
      this.state.temporarySelection.to.row
    )
    const toRow = Math.max(
      this.state.temporarySelection.from.row,
      this.state.temporarySelection.to.row
    )

    for (let row = fromRow; row <= toRow; row++) {
      const lineBefore = this.getDiffLineNumber(
        row,
        this.state.temporarySelection.from.column
      )
      const lineAfter = this.getDiffLineNumber(
        row,
        this.state.temporarySelection.to.column
      )

      if (lineBefore !== null) {
        selection = selection?.withLineSelection(
          lineBefore,
          this.state.temporarySelection.isSelected
        )
      }

      if (lineAfter !== null) {
        selection = selection?.withLineSelection(
          lineAfter,
          this.state.temporarySelection.isSelected
        )
      }
    }

    this.props.onIncludeChanged(selection)

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

  private toggleSearchInput = (evt: KeyboardEvent) => {
    if (evt.metaKey && evt.key === 'f') {
      this.setState({
        isSearching: !this.state.isSearching,
        selectedSearchResult: InitialPosition,
        searchQuery: undefined,
        searchTokens: undefined,
      })
    }
  }

  private onSearch = (searchQuery: string) => {
    if (
      searchQuery === this.state.searchQuery &&
      this.state.searchTokens !== undefined
    ) {
      const selectedSearchResult =
        findNextToken(
          this.state.searchTokens,
          this.props.diff,
          this.props.showSideBySideDiff,
          {
            row: this.state.selectedSearchResult.row,
            offset: this.state.selectedSearchResult.offset + 1,
            diffColumn: this.state.selectedSearchResult.diffColumn,
          }
        ) ?? this.state.selectedSearchResult

      if (selectedSearchResult !== null) {
        this.scrollToRow(selectedSearchResult.row)
      }
      this.setState({ selectedSearchResult })
      return
    }

    const searchTokens = calcSearchTokens(
      this.props.diff,
      this.props.showSideBySideDiff,
      searchQuery
    )
    const selectedSearchResult =
      findNextToken(
        searchTokens,
        this.props.diff,
        this.props.showSideBySideDiff,
        this.state.selectedSearchResult
      ) ?? this.state.selectedSearchResult

    if (selectedSearchResult !== null) {
      this.scrollToRow(selectedSearchResult.row)
    }

    this.setState({ searchTokens, searchQuery, selectedSearchResult })
  }

  private scrollToRow(row: number) {
    this.virtualListRef.current?.scrollToRow(row)
  }

  private onSearchCancel = () => {
    this.setState({
      selectedSearchResult: InitialPosition,
      searchQuery: undefined,
      searchTokens: undefined,
      isSearching: false,
    })
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
 */
const getDiffRows = memoize(function (
  diff: ITextDiff,
  showSideBySideDiff: boolean
): ReadonlyArray<SimplifiedDiffRow> {
  const outputRows = new Array<SimplifiedDiffRow>()

  for (const hunk of diff.hunks) {
    outputRows.push(...getDiffRowsFromHunk(hunk, showSideBySideDiff))
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
 */
function getDiffRowsFromHunk(
  hunk: DiffHunk,
  showSideBySideDiff: boolean
): ReadonlyArray<SimplifiedDiffRow> {
  const rows = new Array<SimplifiedDiffRow>()

  /**
   * Array containing multiple consecutive added/deleted lines. This
   * is used to be able to merge them into modified rows.
   */
  let modifiedLines = new Array<ModifiedLine>()

  for (const [num, line] of hunk.lines.entries()) {
    const diffLineNumber = hunk.unifiedDiffStart + num

    if (line.type === DiffLineType.Delete || line.type === DiffLineType.Add) {
      modifiedLines.push({ line, diffLineNumber })
      continue
    }

    if (modifiedLines.length > 0) {
      // If the current line is not added/deleted and we have any added/deleted
      // line stored, we need to process them.
      rows.push(...getModifiedRows(modifiedLines, showSideBySideDiff))
      modifiedLines = []
    }

    if (line.type === DiffLineType.Hunk) {
      rows.push({ type: DiffRowType.Hunk, content: line.content })
      continue
    }

    if (line.type === DiffLineType.Context) {
      assertNonNullable(
        line.oldLineNumber,
        `No oldLineNumber for ${diffLineNumber}`
      )
      assertNonNullable(
        line.newLineNumber,
        `No newLineNumber for ${diffLineNumber}`
      )

      rows.push({
        type: DiffRowType.Context,
        content: line.content,
        diffLineNumber,
        beforeLineNumber: line.oldLineNumber,
        afterLineNumber: line.newLineNumber,
        beforeTokens: [],
        afterTokens: [],
      })
      continue
    }

    assertNever(line.type, `Invalid line type: ${line.type}`)
  }

  // Do one more pass to process the remaining list of modified lines.
  if (modifiedLines.length > 0) {
    rows.push(...getModifiedRows(modifiedLines, showSideBySideDiff))
  }

  return rows
}

function getModifiedRows(
  addedDeletedLines: ReadonlyArray<ModifiedLine>,
  showSideBySideDiff: boolean
): ReadonlyArray<SimplifiedDiffRow> {
  if (addedDeletedLines.length === 0) {
    return []
  }
  const hunkStartLine = addedDeletedLines[0].diffLineNumber
  const addedLines = new Array<ModifiedLine>()
  const deletedLines = new Array<ModifiedLine>()

  for (const line of addedDeletedLines) {
    if (line.line.type === DiffLineType.Add) {
      addedLines.push(line)
    } else if (line.line.type === DiffLineType.Delete) {
      deletedLines.push(line)
    }
  }

  const output = new Array<SimplifiedDiffRow>()

  const diffTokensBefore = new Array<ILineTokens | undefined>()
  const diffTokensAfter = new Array<ILineTokens | undefined>()

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

  let indexModifiedRow = 0

  while (
    showSideBySideDiff &&
    indexModifiedRow < addedLines.length &&
    indexModifiedRow < deletedLines.length
  ) {
    const addedLine = forceUnwrap(
      'Unexpected null line',
      addedLines[indexModifiedRow]
    )
    const deletedLine = forceUnwrap(
      'Unexpected null line',
      deletedLines[indexModifiedRow]
    )

    // Modified lines
    output.push({
      type: DiffRowType.Modified,
      beforeData: getDataFromLine(
        deletedLine,
        'oldLineNumber',
        diffTokensBefore.shift()
      ),
      afterData: getDataFromLine(
        addedLine,
        'newLineNumber',
        diffTokensAfter.shift()
      ),
      hunkStartLine,
    })

    indexModifiedRow++
  }

  for (let i = indexModifiedRow; i < deletedLines.length; i++) {
    const line = forceUnwrap('Unexpected null line', deletedLines[i])

    output.push({
      type: DiffRowType.Deleted,
      data: getDataFromLine(line, 'oldLineNumber', diffTokensBefore.shift()),
      hunkStartLine,
    })
  }

  for (let i = indexModifiedRow; i < addedLines.length; i++) {
    const line = forceUnwrap('Unexpected null line', addedLines[i])

    // Added line
    output.push({
      type: DiffRowType.Added,
      data: getDataFromLine(line, 'newLineNumber', diffTokensAfter.shift()),
      hunkStartLine,
    })
  }

  return output
}

function getDataFromLine(
  { line, diffLineNumber }: { line: DiffLine; diffLineNumber: number },
  lineToUse: 'oldLineNumber' | 'newLineNumber',
  diffTokens: ILineTokens | undefined
): SimplifiedDiffRowData {
  const lineNumber = forceUnwrap(
    `Expecting ${lineToUse} value for ${line}`,
    line[lineToUse]
  )

  const tokens: ILineTokens[] = []

  if (diffTokens !== undefined) {
    tokens.push(diffTokens)
  }

  return {
    content: line.content,
    lineNumber,
    diffLineNumber,
    noNewLineIndicator: line.noTrailingNewLine,
    tokens,
  }
}

function calcSearchTokens(
  diff: ITextDiff,
  showSideBySideDiffs: boolean,
  searchQuery?: string
): SearchTokens {
  const searchTokens = new Map<number, RowSearchTokens>()

  if (searchQuery === undefined || searchQuery.length === 0) {
    return searchTokens
  }

  const searchRegExp = new RegExp(escapeRegExp(searchQuery), 'gi')
  const rows = getDiffRows(diff, showSideBySideDiffs)

  for (const [rowNumber, row] of rows.entries()) {
    if (row.type === DiffRowType.Hunk) {
      continue
    }

    if (row.type === DiffRowType.Added) {
      const tokens = getSearchTokensForLine(row.data.content, searchRegExp)

      if (tokens !== null) {
        searchTokens.set(rowNumber, {
          [showSideBySideDiffs ? DiffColumn.After : DiffColumn.Before]: tokens,
        })
      }
    }

    if (row.type === DiffRowType.Deleted) {
      const tokens = getSearchTokensForLine(row.data.content, searchRegExp)

      if (tokens !== null) {
        searchTokens.set(rowNumber, { [DiffColumn.Before]: tokens })
      }
    }

    if (row.type === DiffRowType.Context) {
      const tokens = getSearchTokensForLine(row.content, searchRegExp)

      if (tokens !== null) {
        searchTokens.set(rowNumber, {
          [DiffColumn.Before]: tokens,
          [DiffColumn.After]: tokens,
        })
      }
    }

    if (row.type === DiffRowType.Modified) {
      const beforeTokens = getSearchTokensForLine(
        row.beforeData.content,
        searchRegExp
      )
      const afterTokens = getSearchTokensForLine(
        row.afterData.content,
        searchRegExp
      )

      if (beforeTokens !== null || afterTokens !== null) {
        const tokens: RowSearchTokens = {}
        if (beforeTokens !== null) {
          tokens[DiffColumn.Before] = beforeTokens
        }
        if (afterTokens !== null) {
          tokens[DiffColumn.After] = afterTokens
        }
        searchTokens.set(rowNumber, tokens)
      }
    }
  }

  return searchTokens
}

function getSearchTokensForLine(
  lineContents: string,
  regexp: RegExp
): ILineTokens | null {
  const matches = lineContents.matchAll(regexp)

  const searchTokens: ILineTokens = []
  let found = false

  for (const match of matches) {
    if (match.index !== undefined) {
      searchTokens[match.index] = {
        length: match[0].length,
        token: 'search-result',
      }
      found = true
    }
  }

  return found ? searchTokens : null
}

function findNextToken(
  searchTokens: SearchTokens,
  diff: ITextDiff,
  showSideBySideDiff: boolean,
  initialPosition: ISelectionPosition
): ISelectionPosition | null {
  for (const [currentRow, lineTokens] of searchTokens.entries()) {
    let currentColumn = initialPosition.diffColumn

    if (currentRow === initialPosition.row) {
      const result = findNextTokenInLine(
        lineTokens[currentColumn],
        initialPosition.offset
      )

      if (result !== null) {
        return { row: currentRow, offset: result, diffColumn: currentColumn }
      }

      if (currentColumn === DiffColumn.Before && showSideBySideDiff) {
        currentColumn = DiffColumn.After

        const result = findNextTokenInLine(lineTokens[currentColumn], 0)

        if (result !== null) {
          return { row: currentRow, offset: result, diffColumn: currentColumn }
        }
      }
    }

    if (currentRow > initialPosition.row) {
      currentColumn = DiffColumn.Before

      const result = findNextTokenInLine(lineTokens[currentColumn], 0)

      if (result !== null) {
        return { row: currentRow, offset: result, diffColumn: currentColumn }
      }

      currentColumn = DiffColumn.After

      const result2 = findNextTokenInLine(lineTokens[currentColumn], 0)

      if (result2 !== null) {
        return { row: currentRow, offset: result2, diffColumn: currentColumn }
      }
    }
  }

  return initialPosition.row === 0 && initialPosition.offset === 0
    ? null
    : findNextToken(searchTokens, diff, showSideBySideDiff, InitialPosition)
}

function findNextTokenInLine(
  lineTokens: ILineTokens | undefined,
  initialColumn: number
): number | null {
  if (lineTokens === undefined) {
    return null
  }

  for (const [index] of Object.entries(lineTokens)) {
    if (parseInt(index, 10) >= initialColumn) {
      return parseInt(index, 10)
    }
  }

  return null
}

function isInSelection(
  diffLineNumber: number,
  row: number,
  column: DiffColumn,
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined
) {
  const isInStoredSelection = selection?.isSelected(diffLineNumber) ?? false

  if (temporarySelection === undefined) {
    return isInStoredSelection
  }

  const isInTemporary = isInTemporarySelection(row, column, temporarySelection)

  if (temporarySelection.isSelected) {
    return isInStoredSelection || isInTemporary
  } else {
    return isInStoredSelection && !isInTemporary
  }
}

export function isInTemporarySelection(
  row: number,
  column: DiffColumn,
  selection: ISelection | undefined
): selection is ISelection {
  if (selection === undefined) {
    return false
  }

  if (
    row >= Math.min(selection.from.row, selection.to.row) &&
    row <= Math.max(selection.to.row, selection.from.row) &&
    (column === selection.from.column || column === selection.to.column)
  ) {
    return true
  }

  return false
}
