import * as React from 'react'

import {
  ITextDiff,
  DiffLineType,
  DiffHunk,
  DiffLine,
  DiffSelection,
  DiffHunkExpansionType,
  DiffSelectionType,
} from '../../models/diff'
import {
  getLineFilters,
  highlightContents,
  IFileContents,
} from './syntax-highlighting'
import { ITokens, ILineTokens, IToken } from '../../lib/highlighter/types'
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
  OverscanIndicesGetterParams,
  defaultOverscanIndicesGetter,
} from 'react-virtualized'
import {
  CheckBoxIdentifier,
  IRowSelectableGroup,
  IRowSelectableGroupStaticData,
  SideBySideDiffRow,
} from './side-by-side-diff-row'
import memoize from 'memoize-one'
import {
  findInteractiveOriginalDiffRange,
  DiffRangeType,
} from './diff-explorer'
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
  getLineWidthFromDigitCount,
  getNumberOfDigits,
  MaxIntraLineDiffStringLength,
  getFirstAndLastClassesSideBySide,
  textDiffEquals,
  isRowChanged,
} from './diff-helpers'
import { showContextualMenu } from '../../lib/menu-item'
import { getTokens } from './get-tokens'
import { DiffSearchInput } from './diff-search-input'
import {
  expandTextDiffHunk,
  DiffExpansionKind,
  expandWholeTextDiff,
} from './text-diff-expansion'
import { IMenuItem } from '../../lib/menu-item'
import { DiffContentsWarning } from './diff-contents-warning'
import { findDOMNode } from 'react-dom'
import escapeRegExp from 'lodash/escapeRegExp'
import ReactDOM from 'react-dom'
import { AriaLiveContainer } from '../accessibility/aria-live-container'

const DefaultRowHeight = 20

export interface ISelection {
  /// Initial diff line number in the selection
  readonly from: number

  /// Last diff line number in the selection
  readonly to: number

  readonly isSelected: boolean
}

type SearchDirection = 'next' | 'previous'

type ModifiedLine = { line: DiffLine; diffLineNumber: number }

const isElement = (n: Node): n is Element => n.nodeType === Node.ELEMENT_NODE
const closestElement = (n: Node): Element | null =>
  isElement(n) ? n : n.parentElement

const closestRow = (n: Node, container: Element) => {
  const row = closestElement(n)?.closest('div[role=row]')
  if (row && container.contains(row)) {
    const rowIndex =
      row.ariaRowIndex !== null ? parseInt(row.ariaRowIndex, 10) : NaN
    return isNaN(rowIndex) ? undefined : rowIndex
  }

  return undefined
}

interface ISideBySideDiffProps {
  /** The file whose diff should be displayed. */
  readonly file: ChangedFile

  /** The initial diff */
  readonly diff: ITextDiff

  /**
   * Contents of the old and new files related to the current text diff.
   */
  readonly fileContents: IFileContents | null

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

  /** Whether or not whitespace changes are hidden. */
  readonly hideWhitespaceInDiff: boolean

  /**
   * Whether we'll show a confirmation dialog when the user
   * discards changes.
   */
  readonly askForConfirmationOnDiscardChanges?: boolean

  /**
   * Whether we'll show the diff in a side-by-side layout.
   */
  readonly showSideBySideDiff: boolean

  /** Whether or not to show the diff check marks indicating inclusion in a commit */
  readonly showDiffCheckMarks: boolean

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => void
}

interface ISideBySideDiffState {
  /** The diff that should be rendered */
  readonly diff: ITextDiff

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
  readonly selectingTextInRow: 'before' | 'after'

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

  readonly searchResults?: SearchResults

  readonly selectedSearchResult: number | undefined

  readonly ariaLiveMessage: string

  /** This tracks the last expanded hunk index so that we can refocus the expander after rerender */
  readonly lastExpandedHunk: {
    hunkIndex: number
    expansionType: DiffHunkExpansionType
  } | null
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
  private diffContainer: HTMLDivElement | null = null

  /** Diff to restore when "Collapse all expanded lines" option is used */
  private diffToRestore: ITextDiff | null = null

  private textSelectionStartRow: number | undefined = undefined
  private textSelectionEndRow: number | undefined = undefined

  private renderedStartIndex: number = 0
  private renderedStopIndex: number | undefined = undefined

  private readonly hunkExpansionRefs = new Map<string, HTMLButtonElement>()

  /**
   * This is just a signal that will toggle whenever the aria live message
   * changes, indicating it should be reannounced by screen readers.
   */
  private ariaLiveChangeSignal: boolean = false

  /**
   * Caches a group of selectable row's information that does not change on row
   * rerender like line numbers using the row's hunkStartLline as the key.
   */
  private readonly rowSelectableGroupStaticDataCache = new Map<
    number,
    IRowSelectableGroupStaticData
  >()

  public constructor(props: ISideBySideDiffProps) {
    super(props)

    this.state = {
      diff: props.diff,
      isSearching: false,
      selectedSearchResult: undefined,
      selectingTextInRow: 'before',
      lastExpandedHunk: null,
      ariaLiveMessage: '',
    }
  }

  public componentDidMount() {
    this.initDiffSyntaxMode()

    window.addEventListener('keydown', this.onWindowKeyDown)

    // Listen for the custom event find-text (see app.tsx)
    // and trigger the search plugin if we see it.
    document.addEventListener('find-text', this.showSearch)

    document.addEventListener('cut', this.onCutOrCopy)
    document.addEventListener('copy', this.onCutOrCopy)

    document.addEventListener('selectionchange', this.onDocumentSelectionChange)

    this.addContextMenuListenerToDiff()
  }

  private addContextMenuListenerToDiff = () => {
    const diffNode = findDOMNode(this.virtualListRef.current)
    const diff = diffNode instanceof HTMLElement ? diffNode : null
    diff?.addEventListener('contextmenu', this.onContextMenuText)
  }

  private removeContextMenuListenerFromDiff = () => {
    const diffNode = findDOMNode(this.virtualListRef.current)
    const diff = diffNode instanceof HTMLElement ? diffNode : null
    diff?.removeEventListener('contextmenu', this.onContextMenuText)
  }

  private onCutOrCopy = (ev: ClipboardEvent) => {
    if (ev.defaultPrevented || !this.isEntireDiffSelected()) {
      return
    }

    const exclude = this.props.showSideBySideDiff
      ? this.state.selectingTextInRow === 'before'
        ? DiffLineType.Add
        : DiffLineType.Delete
      : false

    const contents = this.state.diff.hunks
      .flatMap(h => h.lines.filter(l => l.type !== exclude).map(l => l.content))
      .join('\n')

    ev.preventDefault()
    ev.clipboardData?.setData('text/plain', contents)
  }

  private onDocumentSelectionChange = (ev: Event) => {
    if (!this.diffContainer) {
      return
    }

    const selection = document.getSelection()

    this.textSelectionStartRow = undefined
    this.textSelectionEndRow = undefined

    if (!selection || selection.isCollapsed) {
      return
    }

    // Check to see if there's at least a partial selection within the
    // diff container. If there isn't then we want to get out of here as
    // quickly as possible.
    if (!selection.containsNode(this.diffContainer, true)) {
      return
    }

    if (this.isEntireDiffSelected(selection)) {
      return
    }

    // Get the range to coerce uniform direction (i.e we don't want to have to
    // care about whether the user is selecting right to left or left to right)
    const range = selection.getRangeAt(0)
    const { startContainer, endContainer } = range

    // The (relative) happy path is when the user is currently selecting within
    // the diff. That means that the start container will very likely be a text
    // node somewhere within a row.
    let startRow = closestRow(startContainer, this.diffContainer)

    // If we couldn't find the row by walking upwards it's likely that the user
    // has moved their selection to the container itself or beyond (i.e dragged
    // their selection all the way up to the point where they're now selecting
    // inside the commit details).
    //
    // If so we attempt to check if the first row we're currently rendering is
    // encompassed in the selection
    if (startRow === undefined) {
      const firstRow = this.diffContainer.querySelector(
        'div[role=row]:first-child'
      )

      if (firstRow && range.intersectsNode(firstRow)) {
        startRow = closestRow(firstRow, this.diffContainer)
      }
    }

    // If we don't have  starting row there's no point in us trying to find
    // the end row.
    if (startRow === undefined) {
      return
    }

    let endRow = closestRow(endContainer, this.diffContainer)

    if (endRow === undefined) {
      const lastRow = this.diffContainer.querySelector(
        'div[role=row]:last-child'
      )

      if (lastRow && range.intersectsNode(lastRow)) {
        endRow = closestRow(lastRow, this.diffContainer)
      }
    }

    this.textSelectionStartRow = startRow
    this.textSelectionEndRow = endRow
  }

  private isEntireDiffSelected(selection = document.getSelection()) {
    const { diffContainer } = this

    if (selection?.rangeCount === 0) {
      return false
    }

    const ancestor = selection?.getRangeAt(0).commonAncestorContainer

    // This is an artefact of the selectAllChildren call in the onSelectAll
    // handler. We can get away with checking for this since we're handling
    // the select-all event coupled with the fact that we have CSS rules which
    // prevents text selection within the diff unless focus resides within the
    // diff container.
    return ancestor === diffContainer
  }

  public componentWillUnmount() {
    window.removeEventListener('keydown', this.onWindowKeyDown)
    document.removeEventListener('mouseup', this.onEndSelection)
    document.removeEventListener('find-text', this.showSearch)
    document.removeEventListener(
      'selectionchange',
      this.onDocumentSelectionChange
    )
    document.removeEventListener('mousemove', this.onUpdateSelection)
    this.removeContextMenuListenerFromDiff()
  }

  public componentDidUpdate(
    prevProps: ISideBySideDiffProps,
    prevState: ISideBySideDiffState
  ) {
    if (
      !highlightParametersEqual(this.props, prevProps, this.state, prevState)
    ) {
      this.initDiffSyntaxMode()
      this.clearListRowsHeightCache()
    }

    if (!textDiffEquals(this.props.diff, prevProps.diff)) {
      this.diffToRestore = null
      this.setState({ diff: this.props.diff, lastExpandedHunk: null })
      this.rowSelectableGroupStaticDataCache.clear()
    }

    // Scroll to top if we switched to a new file
    if (
      this.virtualListRef.current !== null &&
      this.props.file.id !== prevProps.file.id
    ) {
      this.virtualListRef.current.scrollToPosition(0)

      // Reset selection
      this.textSelectionStartRow = undefined
      this.textSelectionEndRow = undefined

      if (this.diffContainer) {
        const selection = document.getSelection()
        if (selection?.containsNode(this.diffContainer, true)) {
          selection.empty()
        }
      }

      this.rowSelectableGroupStaticDataCache.clear()
    }

    if (prevProps.showSideBySideDiff !== this.props.showSideBySideDiff) {
      this.rowSelectableGroupStaticDataCache.clear()
    }

    if (this.state.lastExpandedHunk !== prevState.lastExpandedHunk) {
      this.focusAfterLastExpandedHunkChange()
    }
  }

  private focusListElement = () => {
    const diffNode = findDOMNode(this.virtualListRef.current)
    const diff = diffNode instanceof HTMLElement ? diffNode : null
    diff?.focus()
  }

  /**
   * This handles app focus after a user has clicked on an diff expansion
   * button. With the exception of the top expand up button, the expansion
   * buttons disappear after clicking and by default the focus moves to the app
   * body. This is not ideal for accessibilty as a keyboard user must then tab
   * all the way back to the diff to continut to interact with it.
   *
   * If an expansion button of the type clicked is available, we focus it.
   * Otherwise, we try to find the next closest expansion button and focus that.
   * If no expansion buttons available, we focus the diff container. This makes
   * it so if a user expands down and can expand down further, they will
   * automatically be focused on the next expand down.
   *
   * Other context:
   * - When a user clicks on a diff expansion button, the
   * lastExpandedHunk state is updated. In the componentDidUpdate, we detect
   * that change in order to call this after the new expansion buttons have
   * rendered. The rendered expansion buttons are stored in a map.
   * - A hunk index may have multiple expansion buttons (up and down) so it does
   *   not uniquely identify a button.
   */
  private focusAfterLastExpandedHunkChange() {
    if (this.state.lastExpandedHunk === null) {
      return
    }

    // No expansion buttons? Focus the diff
    if (this.hunkExpansionRefs.size === 0) {
      this.focusListElement()
      return
    }

    const expansionHunkKeys = Array.from(this.hunkExpansionRefs.keys()).sort()
    const { hunkIndex, expansionType } = this.state.lastExpandedHunk
    const lastExpandedKey = `${hunkIndex}-${expansionType}`

    // If there is a new hunk expansion button of same type in same place as the
    // last, focus it
    const lastExpandedHunkButton = this.hunkExpansionRefs.get(lastExpandedKey)
    if (lastExpandedHunkButton) {
      lastExpandedHunkButton.focus()
      return
    }

    function getHunkKeyIndex(key: string) {
      return parseInt(key.split('-').at(0) || '', 10)
    }

    // No?, Then try to focus the next closest hunk in tab order
    const closestInTabOrder = expansionHunkKeys.find(
      key => getHunkKeyIndex(key) >= hunkIndex
    )

    if (closestInTabOrder) {
      const closetHunkButton = this.hunkExpansionRefs.get(closestInTabOrder)
      closetHunkButton?.focus()
      return
    }

    // No? Then try to focus the next closest hunk in reverse tab order
    const closestInReverseTabOrder = expansionHunkKeys
      .reverse()
      .find(key => getHunkKeyIndex(key) <= hunkIndex)

    if (closestInReverseTabOrder) {
      const closetHunkButton = this.hunkExpansionRefs.get(
        closestInReverseTabOrder
      )
      closetHunkButton?.focus()
      return
    }

    // We should never get here, but just in case focus something!
    this.focusListElement()
  }

  private canExpandDiff() {
    const contents = this.props.fileContents
    return (
      contents !== null &&
      contents.canBeExpanded &&
      contents.newContents.length > 0
    )
  }

  private onDiffContainerRef = (ref: HTMLDivElement | null) => {
    if (ref === null) {
      this.diffContainer?.removeEventListener('select-all', this.onSelectAll)
    } else {
      ref.addEventListener('select-all', this.onSelectAll)
    }
    this.diffContainer = ref
  }

  private getCurrentDiffRows() {
    const { diff } = this.state

    return getDiffRows(
      diff,
      this.props.showSideBySideDiff,
      this.canExpandDiff()
    )
  }

  private onRowsRendered = (info: {
    startIndex: number
    stopIndex: number
  }) => {
    this.renderedStartIndex = info.startIndex
    this.renderedStopIndex = info.stopIndex
  }

  public render() {
    const { diff, ariaLiveMessage, isSearching } = this.state

    const rows = this.getCurrentDiffRows()
    const containerClassName = classNames('side-by-side-diff-container', {
      'unified-diff': !this.props.showSideBySideDiff,
      [`selecting-${this.state.selectingTextInRow}`]:
        this.props.showSideBySideDiff &&
        this.state.selectingTextInRow !== undefined,
      editable: canSelect(this.props.file),
    })

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        className={containerClassName}
        onMouseDown={this.onMouseDown}
        onKeyDown={this.onKeyDown}
      >
        <DiffContentsWarning diff={diff} />
        {isSearching && (
          <DiffSearchInput
            onSearch={this.onSearch}
            onClose={this.onSearchCancel}
          />
        )}
        <div
          className="side-by-side-diff cm-s-default"
          ref={this.onDiffContainerRef}
        >
          <AriaLiveContainer
            message={ariaLiveMessage}
            trackedUserInput={this.ariaLiveChangeSignal}
          />
          <AutoSizer onResize={this.clearListRowsHeightCache}>
            {({ height, width }) => (
              <List
                deferredMeasurementCache={listRowsHeightCache}
                width={width}
                height={height}
                rowCount={rows.length}
                rowHeight={this.getRowHeight}
                rowRenderer={this.renderRow}
                onRowsRendered={this.onRowsRendered}
                ref={this.virtualListRef}
                overscanIndicesGetter={this.overscanIndicesGetter}
                // The following properties are passed to the list
                // to make sure that it gets re-rendered when any of
                // them change.
                isSearching={isSearching}
                selectedSearchResult={this.state.selectedSearchResult}
                searchQuery={this.state.searchQuery}
                showSideBySideDiff={this.props.showSideBySideDiff}
                beforeTokens={this.state.beforeTokens}
                afterTokens={this.state.afterTokens}
                temporarySelection={this.state.temporarySelection}
                hoveredHunk={this.state.hoveredHunk}
                showDiffCheckMarks={this.props.showDiffCheckMarks}
                isSelectable={canSelect(this.props.file)}
                fileSelection={this.getSelection()}
                // rows are memoized and include things like the
                // noNewlineIndicator
                rows={rows}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    )
  }

  private overscanIndicesGetter = (params: OverscanIndicesGetterParams) => {
    const [start, end] = [this.textSelectionStartRow, this.textSelectionEndRow]

    if (start === undefined || end === undefined) {
      return defaultOverscanIndicesGetter(params)
    }

    const startIndex = Math.min(start, params.startIndex)
    const stopIndex = Math.max(
      params.stopIndex,
      Math.min(params.cellCount - 1, end)
    )

    return defaultOverscanIndicesGetter({ ...params, startIndex, stopIndex })
  }

  /**
   * Gathers information about if the row is in a selectable group. This
   * information is used to facilitate the use of check all feature for the
   * selectable group.
   *
   * This will return null if the row is not in a selectable group. A group is
   * more than one row.
   */
  private getRowSelectableGroupDetails(
    rowIndex: number
  ): IRowSelectableGroup | null {
    const { diff, hoveredHunk } = this.state

    const rows = getDiffRows(
      diff,
      this.props.showSideBySideDiff,
      this.canExpandDiff()
    )
    const row = rows[rowIndex]

    if (row === undefined || !isRowChanged(row)) {
      return null
    }

    const { hunkStartLine } = row
    const staticData = this.getRowSelectableGroupStaticData(hunkStartLine, rows)
    const { diffRowStartIndex, diffRowStopIndex } = staticData

    const isFirst = diffRowStartIndex === rowIndex
    const isCheckAllRenderedInRow =
      isFirst ||
      (diffRowStartIndex < this.renderedStartIndex &&
        rowIndex === this.renderedStartIndex)

    return {
      isFirst,
      isCheckAllRenderedInRow,
      isHovered: hoveredHunk === hunkStartLine,
      selectionState: this.getSelectableGroupSelectionState(
        diff.hunks,
        hunkStartLine
      ),
      height: this.getRowSelectableGroupHeight(
        diffRowStartIndex,
        diffRowStopIndex
      ),
      staticData,
    }
  }

  private getSelectableGroupSelectionState(
    hunks: ReadonlyArray<DiffHunk>,
    hunkStartLine: number
  ): DiffSelectionType {
    const selection = this.getSelection()
    if (selection === undefined) {
      return DiffSelectionType.None
    }

    const range = findInteractiveOriginalDiffRange(hunks, hunkStartLine)
    if (range === null) {
      //Shouldn't happen, but if it does, we can't do anything with it
      return DiffSelectionType.None
    }

    const { from, to } = range

    return selection.isRangeSelected(from, to - from + 1)
  }

  private getRowSelectableGroupHeight = (from: number, to: number) => {
    const start =
      from > this.renderedStartIndex ? from : this.renderedStartIndex

    const stop =
      this.renderedStopIndex !== undefined && to > this.renderedStopIndex + 10
        ? this.renderedStopIndex + 10
        : to

    let height = 0
    for (let i = start; i <= stop; i++) {
      height += this.getRowHeight({ index: i })
    }

    return height
  }

  private getSelectableGroupRowIndexRange(
    hunkStartLine: number,
    rows: ReadonlyArray<SimplifiedDiffRow>
  ) {
    const diffRowStartIndex = rows.findIndex(
      r => isRowChanged(r) && r.hunkStartLine === hunkStartLine
    )

    let diffRowStopIndex = diffRowStartIndex

    while (
      rows[diffRowStopIndex + 1] !== undefined &&
      isRowChanged(rows[diffRowStopIndex + 1])
    ) {
      diffRowStopIndex++
    }

    return {
      diffRowStartIndex,
      diffRowStopIndex,
    }
  }

  private getRowSelectableGroupStaticData = (
    hunkStartLine: number,
    rows: ReadonlyArray<SimplifiedDiffRow>
  ): IRowSelectableGroupStaticData => {
    const cachedStaticData =
      this.rowSelectableGroupStaticDataCache.get(hunkStartLine)
    if (cachedStaticData !== undefined) {
      return cachedStaticData
    }

    const { diffRowStartIndex, diffRowStopIndex } =
      this.getSelectableGroupRowIndexRange(hunkStartLine, rows)

    const lineNumbers = new Set<number>()
    let hasAfter = false
    let hasBefore = false

    const groupRows = rows.slice(diffRowStartIndex, diffRowStopIndex + 1)

    const lineNumbersIdentifiers: Array<CheckBoxIdentifier> = []

    for (const r of groupRows) {
      if (r.type === DiffRowType.Added) {
        lineNumbers.add(r.data.lineNumber)
        hasAfter = true
        lineNumbersIdentifiers.push(`${r.data.lineNumber}-after`)
      }

      if (r.type === DiffRowType.Deleted) {
        lineNumbers.add(r.data.lineNumber)
        hasBefore = true
        lineNumbersIdentifiers.push(`${r.data.lineNumber}-before`)
      }

      if (r.type === DiffRowType.Modified) {
        hasAfter = true
        hasBefore = true
        lineNumbers.add(r.beforeData.lineNumber)
        lineNumbers.add(r.afterData.lineNumber)
        lineNumbersIdentifiers.push(
          `${r.beforeData.lineNumber}-before`,
          `${r.afterData.lineNumber}-after`
        )
      }
    }

    const diffType =
      hasAfter && hasBefore
        ? DiffRowType.Modified
        : hasAfter
        ? DiffRowType.Added
        : DiffRowType.Deleted

    const data: IRowSelectableGroupStaticData = {
      diffRowStartIndex,
      diffRowStopIndex,
      diffType,
      lineNumbers: Array.from(lineNumbers).sort(),
      lineNumbersIdentifiers,
    }

    this.rowSelectableGroupStaticDataCache.set(hunkStartLine, data)
    return data
  }

  private renderRow = ({ index, parent, style, key }: ListRowProps) => {
    const { diff } = this.state
    const rows = getDiffRows(
      diff,
      this.props.showSideBySideDiff,
      this.canExpandDiff()
    )

    const row = rows[index]
    if (row === undefined) {
      return null
    }

    const prev = rows[index - 1]
    const next = rows[index + 1]

    const beforeClassNames = getFirstAndLastClassesSideBySide(
      row,
      prev,
      next,
      DiffRowType.Deleted
    )
    const afterClassNames = getFirstAndLastClassesSideBySide(
      row,
      prev,
      next,
      DiffRowType.Added
    )

    const lineNumberWidth = getLineWidthFromDigitCount(
      getNumberOfDigits(diff.maxLineNumber)
    )

    const rowWithTokens = this.createFullRow(row, index)

    const rowSelectableGroupDetails = this.getRowSelectableGroupDetails(index)

    return (
      <CellMeasurer
        cache={listRowsHeightCache}
        columnIndex={0}
        key={key}
        parent={parent}
        rowIndex={index}
      >
        <div key={key} style={style} role="row" aria-rowindex={index}>
          <SideBySideDiffRow
            row={rowWithTokens}
            lineNumberWidth={lineNumberWidth}
            numRow={index}
            isDiffSelectable={canSelect(this.props.file)}
            rowSelectableGroup={rowSelectableGroupDetails}
            showSideBySideDiff={this.props.showSideBySideDiff}
            hideWhitespaceInDiff={this.props.hideWhitespaceInDiff}
            showDiffCheckMarks={this.props.showDiffCheckMarks}
            onStartSelection={this.onStartSelection}
            onMouseEnterHunk={this.onMouseEnterHunk}
            onMouseLeaveHunk={this.onMouseLeaveHunk}
            onExpandHunk={this.onExpandHunk}
            onClickHunk={this.onClickHunk}
            onContextMenuLine={this.onContextMenuLine}
            onContextMenuHunk={this.onContextMenuHunk}
            onContextMenuExpandHunk={this.onContextMenuExpandHunk}
            onHideWhitespaceInDiffChanged={
              this.props.onHideWhitespaceInDiffChanged
            }
            beforeClassNames={beforeClassNames}
            afterClassNames={afterClassNames}
            onHunkExpansionRef={this.onHunkExpansionRef}
            onLineNumberCheckedChanged={this.onLineNumberCheckedChanged}
          />
        </div>
      </CellMeasurer>
    )
  }

  private onLineNumberCheckedChanged = (
    row: number,
    column: DiffColumn,
    isSelected: boolean
  ) => {
    if (this.props.onIncludeChanged === undefined) {
      return
    }

    let selection = this.getSelection()
    if (selection === undefined) {
      return
    }

    const lineBefore = this.getDiffLineNumber(row, column)
    const lineAfter = this.getDiffLineNumber(row, column)

    if (lineBefore !== null) {
      selection = selection.withLineSelection(lineBefore, isSelected)
    }

    if (lineAfter !== null) {
      selection = selection.withLineSelection(lineAfter, isSelected)
    }

    this.props.onIncludeChanged(selection)
  }

  private onHunkExpansionRef = (
    hunkIndex: number,
    expansionType: DiffHunkExpansionType,
    button: HTMLButtonElement | null
  ) => {
    const key = `${hunkIndex}-${expansionType}`
    if (button === null) {
      this.hunkExpansionRefs.delete(key)
    } else {
      this.hunkExpansionRefs.set(key, button)
    }
  }

  private getRowHeight = (row: { index: number }) => {
    return listRowsHeightCache.rowHeight(row) ?? DefaultRowHeight
  }

  private clearListRowsHeightCache = () => {
    listRowsHeightCache.clearAll()
  }

  private async initDiffSyntaxMode() {
    const contents = this.props.fileContents

    if (contents === null) {
      return
    }

    const { diff: currentDiff } = this.state

    // Store the current props and state so that we can see if anything
    // changes from underneath us as we're making asynchronous
    // operations that makes our data stale or useless.
    const propsSnapshot = this.props
    const stateSnapshot = this.state

    const lineFilters = getLineFilters(currentDiff.hunks)
    const tabSize = 4

    const tokens = await highlightContents(contents, tabSize, lineFilters)

    if (
      !highlightParametersEqual(
        this.props,
        propsSnapshot,
        this.state,
        stateSnapshot
      )
    ) {
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
          DiffColumn.After,
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

      const beforeSearchTokens = this.getSearchTokens(numRow, DiffColumn.Before)
      if (beforeSearchTokens !== undefined) {
        beforeSearchTokens.forEach(x => beforeTokens.push(x))
      }

      const afterSearchTokens = this.getSearchTokens(numRow, DiffColumn.After)
      if (afterSearchTokens !== undefined) {
        afterSearchTokens.forEach(x => afterTokens.push(x))
      }

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

    if (searchTokens !== undefined) {
      searchTokens.forEach(x => finalTokens.push(x))
    }
    if (lineTokens !== null) {
      finalTokens.push(lineTokens)
    }

    return {
      ...data,
      tokens: finalTokens,
      isSelected:
        data.diffLineNumber !== null &&
        isInSelection(
          data.diffLineNumber,
          this.getSelection(),
          this.state.temporarySelection
        ),
    }
  }

  private getSearchTokens(row: number, column: DiffColumn) {
    const { searchResults: searchTokens, selectedSearchResult } = this.state

    if (searchTokens === undefined) {
      return undefined
    }

    const lineTokens = searchTokens.getLineTokens(row, column)

    if (lineTokens === undefined) {
      return undefined
    }

    if (lineTokens !== undefined && selectedSearchResult !== undefined) {
      const selected = searchTokens.get(selectedSearchResult)

      if (row === selected?.row && column === selected.column) {
        if (lineTokens[selected.offset] !== undefined) {
          const selectedToken = {
            [selected.offset]: { length: selected.length, token: 'selected' },
          }

          return [lineTokens, selectedToken]
        }
      }
    }

    return [lineTokens]
  }

  private getDiffLineNumber(
    rowNumber: number,
    column: DiffColumn
  ): number | null {
    const { diff } = this.state
    const rows = getDiffRows(
      diff,
      this.props.showSideBySideDiff,
      this.canExpandDiff()
    )
    const row = rows[rowNumber]

    if (row === undefined) {
      return null
    }

    return this.getDiffRowLineNumber(row, column)
  }

  private getDiffRowLineNumber(row: SimplifiedDiffRow, column: DiffColumn) {
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

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const modifiers = event.altKey || event.metaKey || event.shiftKey

    if (!__DARWIN__ && event.key === 'a' && event.ctrlKey && !modifiers) {
      this.onSelectAll(event)
    }
  }

  /**
   * Called when the user presses CtrlOrCmd+A while focused within the diff
   * container or when the user triggers the select-all event. Note that this
   * deals with text-selection whereas several other methods in this component
   * named similarly deals with selection within the gutter.
   */
  private onSelectAll = (ev?: Event | React.SyntheticEvent<unknown>) => {
    if (this.diffContainer) {
      ev?.preventDefault()
      document.getSelection()?.selectAllChildren(this.diffContainer)
    }
  }

  private onStartSelection = (
    row: number,
    column: DiffColumn,
    isSelected: boolean
  ) => {
    const line = this.getDiffLineNumber(row, column)
    if (line === null) {
      return
    }
    const temporarySelection = { from: line, to: line, isSelected }
    this.setState({ temporarySelection })

    document.addEventListener('mouseup', this.onEndSelection, { once: true })
    document.addEventListener('mousemove', this.onUpdateSelection)
  }

  private onUpdateSelection = (ev: MouseEvent) => {
    const { temporarySelection } = this.state
    const list = this.virtualListRef.current
    if (!temporarySelection || !list) {
      return
    }

    const listNode = ReactDOM.findDOMNode(list)
    if (!(listNode instanceof Element)) {
      return
    }

    const rect = listNode.getBoundingClientRect()
    const offsetInList = ev.clientY - rect.top
    const offsetInListScroll = offsetInList + listNode.scrollTop

    const rows = this.getCurrentDiffRows()
    const totalRows = rows.length

    let rowOffset = 0

    // I haven't found an easy way to calculate which row the mouse is over,
    // especially since react-virtualized's `getOffsetForRow` is buggy (see
    // https://github.com/bvaughn/react-virtualized/issues/1422).
    // Instead, the approach here is to iterate over all rows and sum their
    // heights to calculate the offset of each row. Once we find the row that
    // contains the mouse, we scroll to it and update the temporary selection.
    for (let index = 0; index < totalRows; index++) {
      // Use row height cache in order to do the math faster
      let height = listRowsHeightCache.getHeight(index, 0)
      if (height === undefined) {
        list.recomputeRowHeights(index)
        height = listRowsHeightCache.getHeight(index, 0) ?? DefaultRowHeight
      }

      if (
        offsetInListScroll >= rowOffset &&
        offsetInListScroll < rowOffset + height
      ) {
        const row = rows[index]
        let column = DiffColumn.Before

        if (this.props.showSideBySideDiff) {
          column =
            ev.clientX <= rect.left + rect.width / 2
              ? DiffColumn.Before
              : DiffColumn.After
        } else {
          // `column` is irrelevant in unified diff because there aren't rows of
          // type Modified (see `getModifiedRows`)
        }
        const diffLineNumber = this.getDiffRowLineNumber(row, column)

        // Always scroll to the row that contains the mouse, to ease range-based
        // selection with it
        list.scrollToRow(index)

        if (diffLineNumber !== null) {
          this.setState({
            temporarySelection: {
              ...temporarySelection,
              to: diffLineNumber,
            },
          })
        }

        return
      }

      rowOffset += height
    }
  }

  private onEndSelection = () => {
    let selection = this.getSelection()
    const { temporarySelection } = this.state

    if (selection === undefined || temporarySelection === undefined) {
      return
    }

    const { from: tmpFrom, to: tmpTo, isSelected } = temporarySelection

    const fromLine = Math.min(tmpFrom, tmpTo)
    const toLine = Math.max(tmpFrom, tmpTo)

    for (let line = fromLine; line <= toLine; line++) {
      selection = selection.withLineSelection(line, isSelected)
    }

    this.props.onIncludeChanged?.(selection)
    this.setState({ temporarySelection: undefined })
  }

  private onMouseEnterHunk = (hunkStartLine: number) => {
    if (this.state.temporarySelection === undefined) {
      this.setState({ hoveredHunk: hunkStartLine })
    }
  }

  private onMouseLeaveHunk = () => {
    this.setState({ hoveredHunk: undefined })
  }

  private onExpandHunk = (
    hunkIndex: number,
    expansionType: DiffHunkExpansionType
  ) => {
    const { diff } = this.state

    if (hunkIndex === -1 || hunkIndex >= diff.hunks.length) {
      return
    }

    this.setState({ lastExpandedHunk: { hunkIndex, expansionType } })

    const kind = expansionType === DiffHunkExpansionType.Down ? 'down' : 'up'

    this.expandHunk(diff.hunks[hunkIndex], kind)

    this.ariaLiveChangeSignal = !this.ariaLiveChangeSignal
    this.setState({ ariaLiveMessage: 'Expanded' })
  }

  private onClickHunk = (hunkStartLine: number, select: boolean) => {
    if (this.props.onIncludeChanged === undefined) {
      return
    }

    const { diff } = this.state
    const selection = this.getSelection()

    if (selection !== undefined) {
      const range = findInteractiveOriginalDiffRange(diff.hunks, hunkStartLine)
      if (range !== null) {
        const { from, to } = range
        const sel = selection.withRangeSelection(from, to - from + 1, select)
        this.props.onIncludeChanged(sel)
      }
    }
  }

  /**
   * Handler to show a context menu when the user right-clicks on the diff text.
   */
  private onContextMenuText = (evt: React.MouseEvent | MouseEvent) => {
    const selectionLength = window.getSelection()?.toString().length ?? 0

    if (
      evt.target instanceof HTMLElement &&
      (evt.target.closest('.line-number') !== null ||
        evt.target.closest('.hunk-handle') !== null || // Windows uses the label element
        evt.target.closest('.hunk-expansion-handle') !== null ||
        evt.target instanceof HTMLInputElement) // macOS users the input element which is adjacent to the .hunk-handle
    ) {
      return
    }

    const items: IMenuItem[] = [
      {
        label: 'Copy',
        // When using role="copy", the enabled attribute is not taken into account.
        role: selectionLength > 0 ? 'copy' : undefined,
        enabled: selectionLength > 0,
      },
      {
        label: __DARWIN__ ? 'Select All' : 'Select all',
        action: () => this.onSelectAll(),
      },
    ]

    const expandMenuItem = this.buildExpandMenuItem()
    if (expandMenuItem !== null) {
      items.push({ type: 'separator' }, expandMenuItem)
    }

    showContextualMenu(items)
  }

  /**
   * Handler to show a context menu when the user right-clicks on a line number.
   *
   * @param diffLineNumber the line number the diff where the user clicked
   */
  private onContextMenuLine = (diffLineNumber: number) => {
    const { file, hideWhitespaceInDiff } = this.props
    const { diff } = this.state

    if (!canSelect(file)) {
      return
    }

    if (hideWhitespaceInDiff) {
      return
    }

    if (this.props.onDiscardChanges === undefined) {
      return
    }

    const range = findInteractiveOriginalDiffRange(diff.hunks, diffLineNumber)
    if (range === null || range.type === null) {
      return
    }

    showContextualMenu([
      {
        label: this.getDiscardLabel(range.type, 1),
        action: () => this.onDiscardChanges(diffLineNumber),
      },
    ])
  }

  private buildExpandMenuItem(): IMenuItem | null {
    const { diff } = this.state
    if (!this.canExpandDiff()) {
      return null
    }

    return this.diffToRestore === null
      ? {
          label: __DARWIN__ ? 'Expand Whole File' : 'Expand whole file',
          action: this.onExpandWholeFile,
          // If there is only one hunk that can't be expanded, disable this item
          enabled:
            diff.hunks.length !== 1 ||
            diff.hunks[0].expansionType !== DiffHunkExpansionType.None,
        }
      : {
          label: __DARWIN__
            ? 'Collapse Expanded Lines'
            : 'Collapse expanded lines',
          action: this.onCollapseExpandedLines,
        }
  }

  private onExpandWholeFile = () => {
    const contents = this.props.fileContents
    const { diff } = this.state

    if (contents === null || !this.canExpandDiff()) {
      return
    }

    const updatedDiff = expandWholeTextDiff(diff, contents.newContents)

    if (updatedDiff === undefined) {
      return
    }

    this.diffToRestore = diff

    this.ariaLiveChangeSignal = !this.ariaLiveChangeSignal
    this.setState({
      diff: updatedDiff,
      ariaLiveMessage: 'Expanded',
    })
  }

  private onCollapseExpandedLines = () => {
    if (this.diffToRestore === null) {
      return
    }

    this.setState({ diff: this.diffToRestore })

    this.diffToRestore = null
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

    const range = findInteractiveOriginalDiffRange(
      this.state.diff.hunks,
      hunkStartLine
    )
    if (range === null || range.type === null) {
      return
    }

    showContextualMenu([
      {
        label: this.getDiscardLabel(range.type, range.to - range.from + 1),
        action: () => this.onDiscardChanges(range.from, range.to),
      },
    ])
  }

  private onContextMenuExpandHunk = () => {
    const expandMenuItem = this.buildExpandMenuItem()
    if (expandMenuItem === null) {
      return
    }

    showContextualMenu([expandMenuItem])
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

    // Pass the original diff (from props) instead of the (potentially)
    // expanded one.
    this.props.onDiscardChanges(this.props.diff, newSelection)
  }

  private onWindowKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented) {
      return
    }

    const isCmdOrCtrl = __DARWIN__
      ? event.metaKey && !event.ctrlKey
      : event.ctrlKey

    if (isCmdOrCtrl && !event.shiftKey && !event.altKey && event.key === 'f') {
      event.preventDefault()
      this.showSearch()
    }
  }

  private showSearch = () => {
    if (!this.state.isSearching) {
      this.resetSearch(true)
    }
  }

  private onSearch = (searchQuery: string, direction: SearchDirection) => {
    const { searchResults } = this.state

    if (searchQuery?.trim() === '') {
      this.resetSearch(true, 'No results')
    } else if (searchQuery === this.state.searchQuery && searchResults) {
      this.continueSearch(searchResults, direction)
    } else {
      this.startSearch(searchQuery, direction)
    }
  }

  private startSearch = (searchQuery: string, direction: SearchDirection) => {
    const searchResults = calcSearchTokens(
      this.state.diff,
      this.props.showSideBySideDiff,
      searchQuery,
      this.canExpandDiff()
    )

    if (searchResults === undefined || searchResults.length === 0) {
      this.resetSearch(true, `No results for "${searchQuery}"`)
    } else {
      const ariaLiveMessage = `Result 1 of ${searchResults.length} for "${searchQuery}"`

      this.scrollToSearchResult(0)

      this.ariaLiveChangeSignal = !this.ariaLiveChangeSignal

      this.setState({
        searchQuery,
        searchResults,
        selectedSearchResult: 0,
        ariaLiveMessage,
      })
    }
  }

  private continueSearch = (
    searchResults: SearchResults,
    direction: SearchDirection
  ) => {
    const { searchQuery } = this.state
    let { selectedSearchResult = 0 } = this.state

    const delta = direction === 'next' ? 1 : -1

    // https://web.archive.org/web/20090717035140if_/javascript.about.com/od/problemsolving/a/modulobug.htm
    selectedSearchResult =
      (selectedSearchResult + delta + searchResults.length) %
      searchResults.length

    const ariaLiveMessage = `Result ${selectedSearchResult + 1} of ${
      searchResults.length
    } for "${searchQuery}"`

    this.scrollToSearchResult(selectedSearchResult)

    this.ariaLiveChangeSignal = !this.ariaLiveChangeSignal
    this.setState({
      searchResults,
      selectedSearchResult,
      ariaLiveMessage,
    })
  }

  private onSearchCancel = () => {
    this.resetSearch(false)
  }

  private scrollToSearchResult = (index: number) => {
    const { searchResults } = this.state

    const scrollToRow = searchResults?.get(index)?.row

    if (scrollToRow !== undefined) {
      this.virtualListRef.current?.scrollToRow(scrollToRow)
    }
  }

  private resetSearch(isSearching: boolean, searchLiveMessage: string = '') {
    this.ariaLiveChangeSignal = !this.ariaLiveChangeSignal
    this.setState({
      selectedSearchResult: undefined,
      searchQuery: undefined,
      searchResults: undefined,
      ariaLiveMessage: searchLiveMessage,
      isSearching,
    })
  }

  /** Expand a selected hunk. */
  private expandHunk(hunk: DiffHunk, kind: DiffExpansionKind) {
    const contents = this.props.fileContents
    const { diff } = this.state

    if (contents === null || !this.canExpandDiff()) {
      return
    }

    const updatedDiff = expandTextDiffHunk(
      diff,
      hunk,
      kind,
      contents.newContents
    )

    if (updatedDiff === undefined) {
      return
    }

    this.setState({ diff: updatedDiff })
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
  prevProps: ISideBySideDiffProps,
  newState: ISideBySideDiffState,
  prevState: ISideBySideDiffState
) {
  return (
    (newProps === prevProps ||
      (newProps.file.id === prevProps.file.id &&
        newProps.showSideBySideDiff === prevProps.showSideBySideDiff)) &&
    newState.diff.text === prevState.diff.text &&
    prevProps.fileContents?.file.id === newProps.fileContents?.file.id
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
  showSideBySideDiff: boolean,
  enableDiffExpansion: boolean
): ReadonlyArray<SimplifiedDiffRow> {
  const outputRows = new Array<SimplifiedDiffRow>()

  diff.hunks.forEach((hunk, index) => {
    for (const row of getDiffRowsFromHunk(
      index,
      hunk,
      showSideBySideDiff,
      enableDiffExpansion
    )) {
      outputRows.push(row)
    }
  })

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
  hunkIndex: number,
  hunk: DiffHunk,
  showSideBySideDiff: boolean,
  enableDiffExpansion: boolean
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
      for (const row of getModifiedRows(modifiedLines, showSideBySideDiff)) {
        rows.push(row)
      }
      modifiedLines = []
    }

    if (line.type === DiffLineType.Hunk) {
      rows.push({
        type: DiffRowType.Hunk,
        content: line.text,
        expansionType: enableDiffExpansion
          ? hunk.expansionType
          : DiffHunkExpansionType.None,
        hunkIndex,
      })
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
    for (const row of getModifiedRows(modifiedLines, showSideBySideDiff)) {
      rows.push(row)
    }
  }

  return rows
}

function getModifiedRows(
  addedOrDeletedLines: ReadonlyArray<ModifiedLine>,
  showSideBySideDiff: boolean
): ReadonlyArray<SimplifiedDiffRow> {
  if (addedOrDeletedLines.length === 0) {
    return []
  }
  const hunkStartLine = addedOrDeletedLines[0].diffLineNumber
  const addedLines = new Array<ModifiedLine>()
  const deletedLines = new Array<ModifiedLine>()

  for (const line of addedOrDeletedLines) {
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
        addedLine.line.content.length < MaxIntraLineDiffStringLength &&
        deletedLine.line.content.length < MaxIntraLineDiffStringLength
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

  const tokens = new Array<ILineTokens>()

  if (diffTokens !== undefined) {
    tokens.push(diffTokens)
  }

  return {
    content: line.content,
    lineNumber,
    diffLineNumber: line.originalLineNumber,
    noNewLineIndicator: line.noTrailingNewLine,
    tokens,
  }
}

/**
 * Helper class that lets us index search results both by their row
 * and column for fast lookup durig the render phase but also by their
 * relative order (index) allowing us to efficiently perform backwards search.
 */
class SearchResults {
  private readonly lookup = new Map<string, ILineTokens>()
  private readonly hits = new Array<[number, DiffColumn, number, number]>()

  private getKey(row: number, column: DiffColumn) {
    return `${row}.${column}`
  }

  public add(row: number, column: DiffColumn, offset: number, length: number) {
    const key = this.getKey(row, column)
    const existing = this.lookup.get(key)
    const token: IToken = { length, token: 'search-result' }

    if (existing !== undefined) {
      existing[offset] = token
    } else {
      this.lookup.set(key, { [offset]: token })
    }

    this.hits.push([row, column, offset, length])
  }

  public get length() {
    return this.hits.length
  }

  public get(index: number) {
    const hit = this.hits[index]
    return hit === undefined
      ? undefined
      : { row: hit[0], column: hit[1], offset: hit[2], length: hit[3] }
  }

  public getLineTokens(row: number, column: DiffColumn) {
    return this.lookup.get(this.getKey(row, column))
  }
}

function calcSearchTokens(
  diff: ITextDiff,
  showSideBySideDiffs: boolean,
  searchQuery: string,
  enableDiffExpansion: boolean
): SearchResults | undefined {
  if (searchQuery.length === 0) {
    return undefined
  }

  const hits = new SearchResults()
  const searchRe = new RegExp(escapeRegExp(searchQuery), 'gi')
  const rows = getDiffRows(diff, showSideBySideDiffs, enableDiffExpansion)

  for (const [rowNumber, row] of rows.entries()) {
    if (row.type === DiffRowType.Hunk) {
      continue
    }

    for (const column of enumerateColumnContents(row, showSideBySideDiffs)) {
      for (const match of column.content.matchAll(searchRe)) {
        if (match.index !== undefined) {
          hits.add(rowNumber, column.type, match.index, match[0].length)
        }
      }
    }
  }

  return hits
}

function* enumerateColumnContents(
  row: SimplifiedDiffRow,
  showSideBySideDiffs: boolean
): IterableIterator<{ type: DiffColumn; content: string }> {
  if (row.type === DiffRowType.Hunk) {
    yield { type: DiffColumn.Before, content: row.content }
  } else if (row.type === DiffRowType.Added) {
    const type = showSideBySideDiffs ? DiffColumn.After : DiffColumn.Before
    yield { type, content: row.data.content }
  } else if (row.type === DiffRowType.Deleted) {
    yield { type: DiffColumn.Before, content: row.data.content }
  } else if (row.type === DiffRowType.Context) {
    yield { type: DiffColumn.Before, content: row.content }
    if (showSideBySideDiffs) {
      yield { type: DiffColumn.After, content: row.content }
    }
  } else if (row.type === DiffRowType.Modified) {
    yield { type: DiffColumn.Before, content: row.beforeData.content }
    yield { type: DiffColumn.After, content: row.afterData.content }
  } else {
    assertNever(row, `Unknown row type ${row}`)
  }
}

function isInSelection(
  diffLineNumber: number,
  selection: DiffSelection | undefined,
  temporarySelection: ISelection | undefined
) {
  const isInStoredSelection = selection?.isSelected(diffLineNumber) ?? false

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

function isInTemporarySelection(
  diffLineNumber: number,
  selection: ISelection | undefined
): selection is ISelection {
  if (selection === undefined) {
    return false
  }

  if (
    diffLineNumber >= Math.min(selection.from, selection.to) &&
    diffLineNumber <= Math.max(selection.to, selection.from)
  ) {
    return true
  }

  return false
}
