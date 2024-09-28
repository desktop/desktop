import * as React from 'react'

import {
  syntaxHighlightLine,
  DiffRow,
  DiffRowType,
  IDiffRowData,
  DiffColumn,
  isRowChanged,
} from './diff-helpers'
import { ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'
import { Octicon, OcticonSymbolVariant } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { shallowEquals, structuralEquals } from '../../lib/equality'
import { DiffHunkExpansionType, DiffSelectionType } from '../../models/diff'
import { PopoverAnchorPosition } from '../lib/popover'
import { WhitespaceHintPopover } from './whitespace-hint-popover'
import { TooltipDirection } from '../lib/tooltip'
import { Button } from '../lib/button'
import { diffCheck, diffDash } from '../octicons/diff'
import {
  enableDiffCheckMarks,
  enableGroupDiffCheckmarks,
} from '../../lib/feature-flag'

// This is a custom version of the no-newline octicon that's exactly as
// tall as it needs to be (8px) which helps with aligning it on the line.
const narrowNoNewlineSymbol: OcticonSymbolVariant = {
  w: 16,
  h: 8,
  p: [
    'm 16,1 0,3 c 0,0.55 -0.45,1 -1,1 l -3,0 0,2 -3,-3 3,-3 0,2 2,0 0,-2 2,0 z M 8,4 C 8,6.2 6.2,8 4,8 1.8,8 0,6.2 0,4 0,1.8 1.8,0 4,0 6.2,0 8,1.8 8,4 Z M 1.5,5.66 5.66,1.5 C 5.18,1.19 4.61,1 4,1 2.34,1 1,2.34 1,4 1,4.61 1.19,5.17 1.5,5.66 Z M 7,4 C 7,3.39 6.81,2.83 6.5,2.34 L 2.34,6.5 C 2.82,6.81 3.39,7 4,7 5.66,7 7,5.66 7,4 Z',
  ],
}

enum DiffRowPrefix {
  Added = '+',
  Deleted = '-',
  Nothing = '\u{A0}',
}

/**
 * This interface is used to pass information about a continuous group of
 * selectable rows to the row component as it pertains to a given row.
 *
 * Primarily used for the styling of the row and it's check all control.
 */
export interface IRowSelectableGroup {
  /**
   * Whether or not the row is the first in the selectable group
   */
  isFirst: boolean

  /**
   * Whether or not the group is hovered by the mouse
   */
  isHovered: boolean

  /**
   * Whether or not the check all handle is rendered in this row
   */
  isCheckAllRenderedInRow: boolean

  /**
   * The selection state of the group - 'All', 'Partial', or 'None'
   */
  selectionState: DiffSelectionType

  /**
   * The height of the number of rendered rows in the group
   *
   * Usually, this is the height of all the rows in the group, but if the group
   * is partially scrolled out of view, it will be the height of the rendered
   * row. The diff is a virtualized list, so a row may be rendered but out of
   * view.
   */
  height: number

  /**
   * The data that does not change on render
   */
  staticData: IRowSelectableGroupStaticData
}

/**
 * This is to house the data that could be cached as it should not change with
 * each row render. It is info such as whether or not the row is the first or
 * last in the group, the line numbers, and the diff type of the group.
 */
export interface IRowSelectableGroupStaticData {
  /**
   * The group's rows starting index.
   *
   * Note: Since the array of diff rows includes hunk
   * headeres, this does not equate to the line numbers.
   */
  diffRowStartIndex: number

  /**
   * The group's rows ending index.
   *
   * Note: Since the array of diff rows includes hunk
   * headers, this does not equate to the line numbers.
   */
  diffRowStopIndex: number

  /** The group's diff type, all 'added',  all 'deleted', or a mix = 'modified */
  diffType: DiffRowType

  /**
   * The line numbers associated with the group
   */
  lineNumbers: ReadonlyArray<number>

  /**
   * The line numbers identifiers associated with the group.
   *
   * If the line numbers are [4, 5, 6] then the lineNumbersIdentifiers could be
   * something like [`4-before`, `4-after`, `5-after`, `6-after`] as the line
   * number is not unique without the "before" or "after" suffix
   */
  lineNumbersIdentifiers: ReadonlyArray<CheckBoxIdentifier>
}

export type CheckBoxIdentifier = `${number}-${'after' | 'before'}`

interface ISideBySideDiffRowProps {
  /**
   * The row data. This contains most of the information used to render the row.
   */
  readonly row: DiffRow

  /**
   * Whether the diff is selectable or read-only.
   */
  readonly isDiffSelectable: boolean

  /**
   * Whether to display the rows side by side.
   */
  readonly showSideBySideDiff: boolean

  /** Whether or not whitespace changes are hidden. */
  readonly hideWhitespaceInDiff: boolean

  /**
   * The width (in pixels) of the diff gutter.
   */
  readonly lineNumberWidth: number

  /**
   * The index of the row in the displayed diff.
   */
  readonly numRow: number

  /**
   * Called when a line selection is started. Called with the
   * row and column of the selected line and a flag to indicate
   * if the user is selecting or unselecting lines.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onStartSelection: (
    row: number,
    column: DiffColumn,
    select: boolean
  ) => void

  /**
   * Called when the user hovers the hunk handle. Called with the start
   * line of the hunk.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onMouseEnterHunk: (hunkStartLine: number) => void

  /**
   * Called when the user unhovers the hunk handle. Called with the start
   * line of the hunk.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onMouseLeaveHunk: (hunkStartLine: number) => void

  readonly onExpandHunk: (
    hunkIndex: number,
    kind: DiffHunkExpansionType
  ) => void

  /**
   * Called when the user clicks on the hunk handle. Called with the start
   * line of the hunk and a flag indicating whether to select or unselect
   * the hunk.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onClickHunk: (hunkStartLine: number, select: boolean) => void

  /**
   * Called when the user right-clicks a line number. Called with the
   * clicked diff line number.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onContextMenuLine: (diffLineNumber: number) => void

  /**
   * Called when the user toggles the inclusion of line
   */
  readonly onLineNumberCheckedChanged: (
    row: number,
    column: DiffColumn,
    select: boolean
  ) => void

  /**
   * Called when the user right-clicks a hunk handle. Called with the start
   * line of the hunk.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onContextMenuHunk: (hunkStartLine: number) => void

  /**
   * Called when the user right-clicks a hunk expansion handle.
   */
  readonly onContextMenuExpandHunk: () => void

  /**
   * Array of classes applied to the after section of a row
   */
  readonly afterClassNames: ReadonlyArray<string>

  /**
   * Array of classes applied to the before section of a row
   */
  readonly beforeClassNames: ReadonlyArray<string>

  /** Called when the user changes the hide whitespace in diffs setting. */
  readonly onHideWhitespaceInDiffChanged: (checked: boolean) => void

  readonly onHunkExpansionRef: (
    hunkIndex: number,
    expansionType: DiffHunkExpansionType,
    element: HTMLButtonElement | null
  ) => void

  /** Whether or not to show the diff check marks indicating inclusion in a commit */
  readonly showDiffCheckMarks: boolean

  /** The selectable group details */
  readonly rowSelectableGroup: IRowSelectableGroup | null
}

interface ISideBySideDiffRowState {
  readonly showWhitespaceHint: DiffColumn | undefined
}

export class SideBySideDiffRow extends React.Component<
  ISideBySideDiffRowProps,
  ISideBySideDiffRowState
> {
  public constructor(props: ISideBySideDiffRowProps) {
    super(props)
    this.state = { showWhitespaceHint: undefined }
  }

  public render() {
    const {
      row,
      showSideBySideDiff,
      beforeClassNames,
      afterClassNames,
      isDiffSelectable,
    } = this.props
    const baseRowClasses = classNames('row', {
      'has-check-all-control':
        enableGroupDiffCheckmarks() &&
        this.props.showDiffCheckMarks &&
        isDiffSelectable,
    })
    const beforeClasses = classNames('before', ...beforeClassNames)
    const afterClasses = classNames('after', ...afterClassNames)
    switch (row.type) {
      case DiffRowType.Hunk: {
        const rowClasses = classNames('hunk-info', baseRowClasses, {
          'expandable-both': row.expansionType === DiffHunkExpansionType.Both,
        })
        return (
          <div className={rowClasses} role="cell">
            {this.renderHunkHeaderGutter(row.hunkIndex, row.expansionType)}
            {this.renderContentFromString(row.content)}
          </div>
        )
      }
      case DiffRowType.Context:
        const rowClasses = classNames('context', baseRowClasses)
        const { beforeLineNumber, afterLineNumber } = row
        if (!showSideBySideDiff) {
          return (
            <div className={rowClasses} role="cell">
              <div className="before">
                {this.renderLineNumbers(
                  [beforeLineNumber, afterLineNumber],
                  undefined
                )}
                {this.renderContentFromString(row.content, row.beforeTokens)}
              </div>
            </div>
          )
        }

        return (
          <div className={rowClasses} role="cell">
            <div className="before">
              {this.renderLineNumber(beforeLineNumber, DiffColumn.Before)}
              {this.renderContentFromString(row.content, row.beforeTokens)}
            </div>
            <div className="after">
              {this.renderLineNumber(afterLineNumber, DiffColumn.After)}
              {this.renderContentFromString(row.content, row.afterTokens)}
            </div>
          </div>
        )

      case DiffRowType.Added: {
        const { lineNumber, isSelected } = row.data
        const rowClasses = classNames('added', baseRowClasses)
        if (!showSideBySideDiff) {
          return (
            <div className={rowClasses} role="cell">
              {this.renderHunkHandle()}
              <div className={afterClasses}>
                {this.renderLineNumbers(
                  [undefined, lineNumber],
                  DiffColumn.After,
                  isSelected
                )}
                {this.renderContent(row.data, DiffRowPrefix.Added)}
                {this.renderWhitespaceHintPopover(DiffColumn.After)}
              </div>
            </div>
          )
        }

        return (
          <div className={rowClasses} role="cell">
            <div className={beforeClasses}>
              {this.renderLineNumber(undefined, DiffColumn.Before)}
              {this.renderContentFromString('')}
              {this.renderWhitespaceHintPopover(DiffColumn.Before)}
            </div>
            {this.renderHunkHandle()}
            <div className={afterClasses}>
              {this.renderLineNumber(lineNumber, DiffColumn.After, isSelected)}
              {this.renderContent(row.data, DiffRowPrefix.Added)}
              {this.renderWhitespaceHintPopover(DiffColumn.After)}
            </div>
          </div>
        )
      }
      case DiffRowType.Deleted: {
        const { lineNumber, isSelected } = row.data
        const rowClasses = classNames('deleted', baseRowClasses)
        if (!showSideBySideDiff) {
          return (
            <div className={rowClasses} role="cell">
              {this.renderHunkHandle()}
              <div className={beforeClasses}>
                {this.renderLineNumbers(
                  [lineNumber, undefined],
                  DiffColumn.Before,
                  isSelected
                )}
                {this.renderContent(row.data, DiffRowPrefix.Deleted)}
                {this.renderWhitespaceHintPopover(DiffColumn.Before)}
              </div>
            </div>
          )
        }

        return (
          <div className={rowClasses} role="cell">
            <div className={beforeClasses}>
              {this.renderLineNumber(lineNumber, DiffColumn.Before, isSelected)}
              {this.renderContent(row.data, DiffRowPrefix.Deleted)}
              {this.renderWhitespaceHintPopover(DiffColumn.Before)}
            </div>
            {this.renderHunkHandle()}
            <div className={afterClasses}>
              {this.renderLineNumber(undefined, DiffColumn.After)}
              {this.renderContentFromString('', [])}
              {this.renderWhitespaceHintPopover(DiffColumn.After)}
            </div>
          </div>
        )
      }
      case DiffRowType.Modified: {
        const { beforeData: before, afterData: after } = row
        const rowClasses = classNames('modified', baseRowClasses)
        return (
          <div className={rowClasses} role="cell">
            <div className={beforeClasses}>
              {this.renderLineNumber(
                before.lineNumber,
                DiffColumn.Before,
                before.isSelected
              )}
              {this.renderContent(before, DiffRowPrefix.Deleted)}
              {this.renderWhitespaceHintPopover(DiffColumn.Before)}
            </div>
            {this.renderHunkHandle()}
            <div className={afterClasses}>
              {this.renderLineNumber(
                after.lineNumber,
                DiffColumn.After,
                after.isSelected
              )}
              {this.renderContent(after, DiffRowPrefix.Added)}
              {this.renderWhitespaceHintPopover(DiffColumn.After)}
            </div>
          </div>
        )
      }
    }
  }

  public shouldComponentUpdate(
    nextProps: ISideBySideDiffRowProps,
    nextState: ISideBySideDiffRowState
  ) {
    if (!shallowEquals(this.state, nextState)) {
      return true
    }

    const { row: prevRow, ...restPrevProps } = this.props
    const { row: nextRow, ...restNextProps } = nextProps

    if (!structuralEquals(prevRow, nextRow)) {
      return true
    }

    return !shallowEquals(restPrevProps, restNextProps)
  }

  private renderContentFromString(
    content: string,
    tokens: ReadonlyArray<ILineTokens> = [],
    prefix: DiffRowPrefix = DiffRowPrefix.Nothing
  ) {
    return this.renderContent({ content, tokens, noNewLineIndicator: false })
  }

  private renderContent(
    data: Pick<IDiffRowData, 'content' | 'noNewLineIndicator' | 'tokens'>,
    prefix: DiffRowPrefix = DiffRowPrefix.Nothing
  ) {
    return (
      <div className="content">
        <div className="prefix">&nbsp;&nbsp;{prefix}&nbsp;&nbsp;</div>
        <div className="content-wrapper">
          {/* Copy to clipboard will ignore empty "lines" unless we add br */}
          {data.content.length === 0 && <br />}

          {syntaxHighlightLine(data.content, data.tokens)}
          {data.noNewLineIndicator && (
            <Octicon
              symbol={narrowNoNewlineSymbol}
              title="No newline at end of file"
            />
          )}
        </div>
      </div>
    )
  }

  private getHunkExpansionElementInfo(
    hunkIndex: number,
    expansionType: DiffHunkExpansionType
  ) {
    switch (expansionType) {
      // This can only be the first hunk
      case DiffHunkExpansionType.Up:
        return {
          icon: octicons.foldUp,
          title: 'Expand Up',
          handler: this.onExpandHunk(hunkIndex, expansionType),
        }
      // This can only be the last dummy hunk. In this case, we expand the
      // second to last hunk down.
      case DiffHunkExpansionType.Down:
        return {
          icon: octicons.foldDown,
          title: 'Expand Down',
          handler: this.onExpandHunk(hunkIndex - 1, expansionType),
        }
      case DiffHunkExpansionType.Short:
        return {
          icon: octicons.fold,
          title: 'Expand All',
          handler: this.onExpandHunk(hunkIndex, expansionType),
        }
    }

    throw new Error(`Unexpected expansion type ${expansionType}`)
  }

  /**
   * This method returns the width of a line gutter in pixels. For unified diffs
   * the gutter contains the line number of both before and after sides, whereas
   * for side-by-side diffs the gutter contains the line number of only one side.
   */
  private get lineGutterWidth() {
    const {
      showSideBySideDiff,
      lineNumberWidth,
      isDiffSelectable,
      showDiffCheckMarks,
    } = this.props
    return (
      (showSideBySideDiff ? lineNumberWidth : lineNumberWidth * 2) +
      (isDiffSelectable && showDiffCheckMarks && enableDiffCheckMarks()
        ? 20
        : 0)
    )
  }

  private renderHunkExpansionHandle(
    hunkIndex: number,
    expansionType: DiffHunkExpansionType
  ) {
    const width = this.lineGutterWidth
    if (expansionType === DiffHunkExpansionType.None) {
      return (
        <div className="hunk-expansion-handle" style={{ width }}>
          <div className="hunk-expansion-placeholder" />
        </div>
      )
    }

    const elementInfo = this.getHunkExpansionElementInfo(
      hunkIndex,
      expansionType
    )

    return (
      <div
        className="hunk-expansion-handle selectable hoverable"
        style={{ width }}
      >
        <Button
          onClick={elementInfo.handler}
          onContextMenu={this.props.onContextMenuExpandHunk}
          tooltip={elementInfo.title}
          toolTipDirection={TooltipDirection.SOUTH}
          ariaLabel={elementInfo.title}
          onButtonRef={this.getOnHunkExpansionRef(hunkIndex, expansionType)}
        >
          <Octicon symbol={elementInfo.icon} />
        </Button>
      </div>
    )
  }

  private getOnHunkExpansionRef =
    (hunkIndex: number, expansionType: DiffHunkExpansionType) =>
    (button: HTMLButtonElement | null) => {
      this.props.onHunkExpansionRef(hunkIndex, expansionType, button)
    }

  private renderHunkHeaderGutter(
    hunkIndex: number,
    expansionType: DiffHunkExpansionType
  ) {
    if (expansionType === DiffHunkExpansionType.Both) {
      return (
        <div>
          {this.renderHunkExpansionHandle(
            hunkIndex,
            DiffHunkExpansionType.Down
          )}
          {this.renderHunkExpansionHandle(hunkIndex, DiffHunkExpansionType.Up)}
        </div>
      )
    }

    return this.renderHunkExpansionHandle(hunkIndex, expansionType)
  }

  private renderHunkHandle() {
    const { isDiffSelectable, rowSelectableGroup, row } = this.props
    if (!isDiffSelectable) {
      return null
    }

    if (!isRowChanged(row)) {
      return null
    }

    if (rowSelectableGroup === null) {
      return this.renderHunkHandlePlaceHolder()
    }

    const {
      height,
      selectionState,
      staticData,
      isCheckAllRenderedInRow,
      isFirst,
    } = rowSelectableGroup

    if (!isCheckAllRenderedInRow) {
      return this.renderHunkHandlePlaceHolder(selectionState)
    }

    const { lineNumbers, lineNumbersIdentifiers, diffType } = staticData
    const isOnlyOneCheckInRow = lineNumbersIdentifiers.length === 1
    const style = { height }
    const hunkHandleClassName = classNames('hunk-handle', 'hoverable', {
      // selected is a class if any line in the group is selected
      selected: selectionState !== DiffSelectionType.None,
    })
    const checkAllId = lineNumbersIdentifiers.join('-')

    /* The hunk-handle is a a single element with a calculated height of all the
     rows in the selectable group (See `getRowSelectableGroupHeight` in
     `side-by-side-diff.tsx`). This gives us a single element to be our control
     of the check all functionality. It is positioned absolutely over the
     hunk-handle-place-holders in each row in order to provide one element that
     is interactive.

     Other notes: I originally attempted to just use a single hunk-handle
     for the first row in a group as the heights of the rows are calculated and
     the rows do not clip overflow. However, that messes with the initial
     measurement for cache of the first row's height as the cell measurer will
     include the hunk handles initially calculated height (num rows times
     default row height) in it's measurement. (Resulting in the first row in a
     group heights = to however many lines in the group x 20) Thus, I decided to
     use the place holder element in each row to define the width of the hunk
     handle in the row and just position the hunk handle over them. A bit on the
     hacky side.
    */
    const hunkHandle = (
      <label
        htmlFor={checkAllId}
        onMouseEnter={this.onMouseEnterHunk}
        onMouseLeave={this.onMouseLeaveHunk}
        onContextMenu={this.onContextMenuHunk}
        className={hunkHandleClassName}
        style={style}
      >
        <span className="focus-handle">
          {(!enableGroupDiffCheckmarks() || !this.props.showDiffCheckMarks) && (
            <div className="increased-hover-surface" style={{ height }} />
          )}
          {!isOnlyOneCheckInRow &&
            this.getCheckAllOcticon(selectionState, isFirst)}
          {!isOnlyOneCheckInRow && (
            <span className="sr-only">
              {' '}
              Lines {lineNumbers.at(0)} to {lineNumbers.at(-1)}{' '}
              {diffType === DiffRowType.Added
                ? 'added'
                : diffType === DiffRowType.Deleted
                ? 'deleted'
                : 'modified'}
            </span>
          )}
        </span>
      </label>
    )

    const checkAllControl = (
      <input
        className="sr-only"
        id={checkAllId}
        type="checkbox"
        aria-controls={lineNumbersIdentifiers.join(' ')}
        aria-checked={
          selectionState === DiffSelectionType.All
            ? true
            : selectionState === DiffSelectionType.Partial
            ? 'mixed'
            : false
        }
        onChange={this.onClickHunk}
        onFocus={this.onHunkFocus}
        onBlur={this.onHunkBlur}
        onContextMenu={this.onContextMenuHunk}
      />
    )

    return (
      <>
        {!isOnlyOneCheckInRow && checkAllControl}
        {hunkHandle}
        {this.renderHunkHandlePlaceHolder(selectionState)}
      </>
    )
  }

  /**
   * On scroll of the diff, the rendering of the hunk handle can be delayed so
   * we make the placeholder mimic the selected state so visually it looks like
   * the hunk handle is there and there isn't a flickter of grey background.
   */
  private renderHunkHandlePlaceHolder = (
    selectionState?: DiffSelectionType
  ) => {
    return (
      <div
        className={classNames('hunk-handle-place-holder', {
          selected: selectionState !== DiffSelectionType.None,
        })}
      ></div>
    )
  }

  private getCheckAllOcticon = (
    selectionState: DiffSelectionType,
    isFirst: boolean
  ) => {
    if (
      !enableGroupDiffCheckmarks() ||
      !isFirst ||
      !this.props.showDiffCheckMarks
    ) {
      return null
    }

    if (selectionState === DiffSelectionType.All) {
      return <Octicon symbol={diffCheck} />
    }
    if (selectionState === DiffSelectionType.Partial) {
      return <Octicon symbol={diffDash} />
    }

    return null
  }

  private getLineNumbersContainerID(column: DiffColumn) {
    return `line-numbers-${this.props.numRow}-${column}`
  }

  /**
   * Renders the line number box.
   *
   * @param lineNumbers Array with line numbers to display.
   * @param column      Column to which the line number belongs.
   * @param isSelected  Whether the line has been selected.
   *                    If undefined is passed, the line is treated
   *                    as non-selectable.
   */
  private renderLineNumbers(
    lineNumbers: Array<number | undefined>,
    column: DiffColumn | undefined,
    isSelected?: boolean
  ) {
    const wrapperID =
      column === undefined ? undefined : this.getLineNumbersContainerID(column)
    const isSelectable = this.props.isDiffSelectable && isSelected !== undefined
    const classes = classNames('line-number', {
      selectable: isSelectable,
      hoverable: isSelectable,
      'line-selected': isSelected,
      hover: this.props.rowSelectableGroup?.isHovered,
    })

    const firstDefinedLineNumber = lineNumbers
      .filter(ln => ln !== undefined)
      .at(0)
    if (firstDefinedLineNumber === undefined) {
      // This shouldn't be possible. If there are no line numbers, we shouldn't
      // be rendering this component.
      return null
    }

    // Note: This id is used by the check all aria-controls attribute,
    // modification of this should be reflected there.
    const checkboxId: CheckBoxIdentifier = `${firstDefinedLineNumber}-${
      column === DiffColumn.After ? 'after' : 'before'
    }`

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        id={wrapperID}
        className={classes}
        style={{ width: this.lineGutterWidth }}
        onMouseDown={this.onMouseDownLineNumber}
      >
        {isSelectable &&
          this.renderLineNumberCheckbox(checkboxId, isSelected === true)}
        <label
          htmlFor={checkboxId}
          onContextMenu={this.onContextMenuLineNumber}
        >
          {this.renderLineNumberCheck(isSelected)}
          {lineNumbers.map((lineNumber, index) => (
            <span key={index}>
              {lineNumber && <span className="sr-only">Line </span>}
              {lineNumber}
              {lineNumber && isSelected !== undefined && (
                <span className="sr-only">
                  {column === DiffColumn.After ? ' added' : ' deleted'}
                </span>
              )}
            </span>
          ))}
        </label>
      </div>
    )
  }

  private renderLineNumberCheck(isSelected?: boolean) {
    if (
      !this.props.isDiffSelectable ||
      !enableDiffCheckMarks() ||
      !this.props.showDiffCheckMarks
    ) {
      return null
    }

    return (
      <div className="line-number-check">
        {isSelected ? <Octicon symbol={diffCheck} /> : null}
      </div>
    )
  }

  private renderLineNumberCheckbox(
    checkboxId: string | undefined,
    isSelected: boolean
  ) {
    return (
      <input
        onContextMenu={this.onContextMenuLineNumber}
        className="sr-only"
        id={checkboxId}
        type="checkbox"
        onChange={this.onLineNumberCheckboxChange}
        checked={isSelected}
      />
    )
  }

  private renderWhitespaceHintPopover(column: DiffColumn) {
    if (this.state.showWhitespaceHint !== column) {
      return
    }
    const elementID = `line-numbers-${this.props.numRow}-${column}`
    const anchor = document.getElementById(elementID)
    if (anchor === null) {
      return
    }

    const anchorPosition =
      column === DiffColumn.Before
        ? PopoverAnchorPosition.LeftTop
        : PopoverAnchorPosition.RightTop

    return (
      <WhitespaceHintPopover
        anchor={anchor}
        anchorPosition={anchorPosition}
        onHideWhitespaceInDiffChanged={this.props.onHideWhitespaceInDiffChanged}
        onDismissed={this.onWhitespaceHintClose}
      />
    )
  }

  private onWhitespaceHintClose = () => {
    this.setState({ showWhitespaceHint: undefined })
  }

  /**
   * Renders the line number box.
   *
   * @param lineNumber  Line number to display.
   * @param column      Column to which the line number belongs.
   * @param isSelected  Whether the line has been selected.
   *                    If undefined is passed, the line is treated
   *                    as non-selectable.
   */
  private renderLineNumber(
    lineNumber: number | undefined,
    column: DiffColumn,
    isSelected?: boolean
  ) {
    return this.renderLineNumbers([lineNumber], column, isSelected)
  }

  private getDiffColumn(targetElement?: Element): DiffColumn | null {
    const { row } = this.props

    switch (row.type) {
      case DiffRowType.Added:
        return DiffColumn.After
      case DiffRowType.Deleted:
        return DiffColumn.Before
      case DiffRowType.Modified:
        return targetElement?.closest('.after')
          ? DiffColumn.After
          : DiffColumn.Before
    }

    return null
  }

  /**
   * Returns the data object for the current row if the current row is
   * added, deleted or modified, null otherwise.
   *
   * On modified rows it normally returns the data corresponding to the
   * previous state. In this situation an optional targetElement param can
   * be passed which will be used to infer either the previous or the next
   * state data (based on which column the target element belongs).
   *
   * @param targetElement Optional element to pass to infer which data to use
   *                      on modified rows.
   */
  private getDiffData(targetElement?: Element): IDiffRowData | null {
    const { row } = this.props

    switch (row.type) {
      case DiffRowType.Added:
      case DiffRowType.Deleted:
        return row.data
      case DiffRowType.Modified:
        return targetElement?.closest('.after') ? row.afterData : row.beforeData
    }

    return null
  }

  private onLineNumberCheckboxChange = ({
    currentTarget: checkbox,
  }: {
    currentTarget: HTMLInputElement
  }) => {
    const column = this.getDiffColumn(checkbox)

    if (column === null) {
      return
    }

    if (this.props.hideWhitespaceInDiff) {
      this.setState({ showWhitespaceHint: column })
      return
    }

    this.props.onLineNumberCheckedChanged(
      this.props.numRow,
      column,
      checkbox.checked
    )
  }

  private onMouseDownLineNumber = (evt: React.MouseEvent) => {
    if (evt.buttons === 2) {
      return
    }

    const column = this.getDiffColumn(evt.currentTarget)
    const data = this.getDiffData(evt.currentTarget)

    if (column === null) {
      return
    }

    if (this.props.hideWhitespaceInDiff) {
      this.setState({ showWhitespaceHint: column })
      return
    }

    if (data === null) {
      return
    }

    this.props.onStartSelection(this.props.numRow, column, !data.isSelected)
  }

  private onMouseEnterHunk = () => {
    if ('hunkStartLine' in this.props.row) {
      this.props.onMouseEnterHunk(this.props.row.hunkStartLine)
    }
  }

  private onMouseLeaveHunk = () => {
    if ('hunkStartLine' in this.props.row) {
      this.props.onMouseLeaveHunk(this.props.row.hunkStartLine)
    }
  }

  private onHunkFocus = () => {
    if ('hunkStartLine' in this.props.row) {
      this.props.onMouseEnterHunk(this.props.row.hunkStartLine)
    }
  }

  private onHunkBlur = () => {
    if ('hunkStartLine' in this.props.row) {
      this.props.onMouseLeaveHunk(this.props.row.hunkStartLine)
    }
  }

  private onExpandHunk =
    (hunkIndex: number, kind: DiffHunkExpansionType) => () => {
      this.props.onExpandHunk(hunkIndex, kind)
    }

  private onClickHunk = () => {
    if (this.props.hideWhitespaceInDiff) {
      const { row } = this.props
      // Prefer left hand side popovers when clicking hunk except for when
      // the left hand side doesn't have a gutter
      const column =
        row.type === DiffRowType.Added ? DiffColumn.After : DiffColumn.Before

      this.setState({ showWhitespaceHint: column })
      return
    }

    // Since the hunk handler lies between the previous and the next columns,
    // when clicking on it on modified lines we cannot know if we should
    // use the state of the previous or the next line to know whether we should
    // select or unselect the hunk.
    // To workaround this, we're relying on the logic of `getDiffData()` to have
    // a consistent behaviour (which will use the previous column state in this case).
    const data = this.getDiffData()

    if (data !== null && 'hunkStartLine' in this.props.row) {
      this.props.onClickHunk(this.props.row.hunkStartLine, !data.isSelected)
    }
  }

  private onContextMenuLineNumber = (evt: React.MouseEvent) => {
    if (this.props.hideWhitespaceInDiff) {
      return
    }

    const data = this.getDiffData(evt.currentTarget)
    if (data !== null && data.diffLineNumber !== null) {
      this.props.onContextMenuLine(data.diffLineNumber)
    }
  }

  private onContextMenuHunk = () => {
    if (this.props.hideWhitespaceInDiff) {
      return
    }

    if ('hunkStartLine' in this.props.row) {
      this.props.onContextMenuHunk(this.props.row.hunkStartLine)
    }
  }
}
