import * as React from 'react'

import {
  syntaxHighlightLine,
  DiffRow,
  DiffRowType,
  IDiffRowData,
  DiffColumn,
} from './diff-helpers'
import { ILineTokens } from '../../lib/highlighter/types'
import classNames from 'classnames'
import { Octicon } from '../octicons'
import * as OcticonSymbol from '../octicons/octicons.generated'
import { narrowNoNewlineSymbol } from './text-diff'
import { shallowEquals, structuralEquals } from '../../lib/equality'
import { DiffHunkExpansionType } from '../../models/diff'
import { PopoverAnchorPosition } from '../lib/popover'
import { WhitespaceHintPopover } from './whitespace-hint-popover'
import { TooltipDirection } from '../lib/tooltip'
import { Button } from '../lib/button'

enum DiffRowPrefix {
  Added = '+',
  Deleted = '-',
  Nothing = '\u{A0}',
}

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
   * Whether the row belongs to a hunk that is hovered.
   */
  readonly isHunkHovered: boolean

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
   * Called when a line selection is updated. Called with the
   * row and column of the hovered line.
   * (only relevant when isDiffSelectable is true)
   */
  readonly onUpdateSelection: (row: number, column: DiffColumn) => void

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
   * Called when the user right-clicks text on the diff.
   */
  readonly onContextMenuText: () => void

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
    const { row, showSideBySideDiff, beforeClassNames, afterClassNames } =
      this.props

    const beforeClasses = classNames('before', ...beforeClassNames)
    const afterClasses = classNames('after', ...afterClassNames)
    switch (row.type) {
      case DiffRowType.Hunk: {
        const className = ['row', 'hunk-info']
        if (row.expansionType === DiffHunkExpansionType.Both) {
          className.push('expandable-both')
        }

        return (
          <div className={classNames(className)}>
            {this.renderHunkHeaderGutter(row.hunkIndex, row.expansionType)}
            {this.renderContentFromString(row.content)}
          </div>
        )
      }
      case DiffRowType.Context:
        const { beforeLineNumber, afterLineNumber } = row
        if (!showSideBySideDiff) {
          return (
            <div className="row context">
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
          <div className="row context">
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
        if (!showSideBySideDiff) {
          return (
            <div
              className="row added"
              onMouseEnter={this.onMouseEnterLineNumber}
            >
              <div className={afterClasses}>
                {this.renderLineNumbers(
                  [undefined, lineNumber],
                  DiffColumn.After,
                  isSelected
                )}
                {this.renderHunkHandle()}
                {this.renderContent(row.data, DiffRowPrefix.Added)}
                {this.renderWhitespaceHintPopover(DiffColumn.After)}
              </div>
            </div>
          )
        }

        return (
          <div className="row added" onMouseEnter={this.onMouseEnterLineNumber}>
            <div className={beforeClasses}>
              {this.renderLineNumber(undefined, DiffColumn.Before)}
              {this.renderContentFromString('')}
              {this.renderWhitespaceHintPopover(DiffColumn.Before)}
            </div>
            <div className={afterClasses}>
              {this.renderLineNumber(lineNumber, DiffColumn.After, isSelected)}
              {this.renderContent(row.data, DiffRowPrefix.Added)}
              {this.renderWhitespaceHintPopover(DiffColumn.After)}
            </div>
            {this.renderHunkHandle()}
          </div>
        )
      }
      case DiffRowType.Deleted: {
        const { lineNumber, isSelected } = row.data
        if (!showSideBySideDiff) {
          return (
            <div
              className="row deleted"
              onMouseEnter={this.onMouseEnterLineNumber}
            >
              <div className={beforeClasses}>
                {this.renderLineNumbers(
                  [lineNumber, undefined],
                  DiffColumn.Before,
                  isSelected
                )}
                {this.renderHunkHandle()}
                {this.renderContent(row.data, DiffRowPrefix.Deleted)}
                {this.renderWhitespaceHintPopover(DiffColumn.Before)}
              </div>
            </div>
          )
        }

        return (
          <div
            className="row deleted"
            onMouseEnter={this.onMouseEnterLineNumber}
          >
            <div className={beforeClasses}>
              {this.renderLineNumber(lineNumber, DiffColumn.Before, isSelected)}
              {this.renderContent(row.data, DiffRowPrefix.Deleted)}
              {this.renderWhitespaceHintPopover(DiffColumn.Before)}
            </div>
            <div className={afterClasses}>
              {this.renderLineNumber(undefined, DiffColumn.After)}
              {this.renderContentFromString('', [])}
              {this.renderWhitespaceHintPopover(DiffColumn.After)}
            </div>
            {this.renderHunkHandle()}
          </div>
        )
      }
      case DiffRowType.Modified: {
        const { beforeData: before, afterData: after } = row
        return (
          <div className="row modified">
            <div
              className={beforeClasses}
              onMouseEnter={this.onMouseEnterLineNumber}
            >
              {this.renderLineNumber(
                before.lineNumber,
                DiffColumn.Before,
                before.isSelected
              )}
              {this.renderContent(before, DiffRowPrefix.Deleted)}
              {this.renderWhitespaceHintPopover(DiffColumn.Before)}
            </div>
            <div
              className={afterClasses}
              onMouseEnter={this.onMouseEnterLineNumber}
            >
              {this.renderLineNumber(
                after.lineNumber,
                DiffColumn.After,
                after.isSelected
              )}
              {this.renderContent(after, DiffRowPrefix.Added)}
              {this.renderWhitespaceHintPopover(DiffColumn.After)}
            </div>
            {this.renderHunkHandle()}
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
      <div className="content" onContextMenu={this.props.onContextMenuText}>
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
          icon: OcticonSymbol.foldUp,
          title: 'Expand Up',
          handler: this.onExpandHunk(hunkIndex, expansionType),
        }
      // This can only be the last dummy hunk. In this case, we expand the
      // second to last hunk down.
      case DiffHunkExpansionType.Down:
        return {
          icon: OcticonSymbol.foldDown,
          title: 'Expand Down',
          handler: this.onExpandHunk(hunkIndex - 1, expansionType),
        }
      case DiffHunkExpansionType.Short:
        return {
          icon: OcticonSymbol.fold,
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
    const { showSideBySideDiff, lineNumberWidth } = this.props
    return showSideBySideDiff ? lineNumberWidth : lineNumberWidth * 2
  }

  private renderHunkExpansionHandle(
    hunkIndex: number,
    expansionType: DiffHunkExpansionType
  ) {
    if (expansionType === DiffHunkExpansionType.None) {
      return (
        <div
          className="hunk-expansion-handle"
          style={{ width: this.lineGutterWidth }}
        >
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
        style={{ width: this.lineGutterWidth }}
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
    if (!this.props.isDiffSelectable) {
      return null
    }

    // In unified mode, the hunk handle left position depends on the line gutter
    // width.
    const style: React.CSSProperties = this.props.showSideBySideDiff
      ? {}
      : { left: this.lineGutterWidth }

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        className="hunk-handle hoverable"
        onMouseEnter={this.onMouseEnterHunk}
        onMouseLeave={this.onMouseLeaveHunk}
        onClick={this.onClickHunk}
        onContextMenu={this.onContextMenuHunk}
        style={style}
      ></div>
    )
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
    if (!this.props.isDiffSelectable || isSelected === undefined) {
      return (
        <div
          id={wrapperID}
          className="line-number"
          style={{ width: this.lineGutterWidth }}
        >
          {lineNumbers.map((lineNumber, index) => (
            <span key={index}>{lineNumber}</span>
          ))}
        </div>
      )
    }

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        id={wrapperID}
        className={classNames('line-number', 'selectable', 'hoverable', {
          'line-selected': isSelected,
          hover: this.props.isHunkHovered,
        })}
        style={{ width: this.lineGutterWidth }}
        onMouseDown={this.onMouseDownLineNumber}
        onContextMenu={this.onContextMenuLineNumber}
      >
        {lineNumbers.map((lineNumber, index) => (
          <span key={index}>{lineNumber}</span>
        ))}
      </div>
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

  private onMouseDownLineNumber = (evt: React.MouseEvent) => {
    if (evt.buttons === 2) {
      return
    }

    const column = this.getDiffColumn(evt.currentTarget)
    const data = this.getDiffData(evt.currentTarget)

    if (data !== null && column !== null) {
      if (this.props.hideWhitespaceInDiff) {
        this.setState({ showWhitespaceHint: column })
        return
      }

      this.props.onStartSelection(this.props.numRow, column, !data.isSelected)
    }
  }

  private onMouseEnterLineNumber = (evt: React.MouseEvent) => {
    if (this.props.hideWhitespaceInDiff) {
      return
    }

    const data = this.getDiffData(evt.currentTarget)
    const column = this.getDiffColumn(evt.currentTarget)

    if (data !== null && column !== null) {
      this.props.onUpdateSelection(this.props.numRow, column)
    }
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
