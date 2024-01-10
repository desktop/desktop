import * as React from 'react'
import classNames from 'classnames'
import { RowIndexPath } from './list-row-index-path'

interface IListRowProps {
  /** whether or not the section to which this row belongs has a header */
  readonly sectionHasHeader: boolean

  /** the total number of row in this list */
  readonly rowCount: number

  /** the index of the row in the list */
  readonly rowIndex: RowIndexPath

  /** custom styles to provide to the row */
  readonly style?: React.CSSProperties

  /** set a tab index for this row (if selectable) */
  readonly tabIndex?: number

  /** an optional id to provide to the element */
  readonly id?: string

  /** whether the row should be rendered as selected */
  readonly selected?: boolean

  /** whether the row should be rendered as selected for keyboard insertion*/
  readonly selectedForKeyboardInsertion?: boolean

  /** whether the list to which this row belongs is in keyboard insertion mode */
  readonly inKeyboardInsertionMode: boolean

  /** callback to fire when the DOM element is created */
  readonly onRowRef?: (
    index: RowIndexPath,
    element: HTMLDivElement | null
  ) => void

  /** callback to fire when the row receives a mousedown event */
  readonly onRowMouseDown: (
    index: RowIndexPath,
    e: React.MouseEvent<any>
  ) => void

  /** callback to fire when the row receives a mouseup event */
  readonly onRowMouseUp: (index: RowIndexPath, e: React.MouseEvent<any>) => void

  /** callback to fire when the row is clicked */
  readonly onRowClick: (index: RowIndexPath, e: React.MouseEvent<any>) => void

  /** callback to fire when the row is double clicked */
  readonly onRowDoubleClick: (
    index: RowIndexPath,
    e: React.MouseEvent<any>
  ) => void

  /** callback to fire when the row receives a keyboard event */
  readonly onRowKeyDown: (
    index: RowIndexPath,
    e: React.KeyboardEvent<any>
  ) => void

  /** called when the row (or any of its descendants) receives focus due to a
   * keyboard event
   */
  readonly onRowKeyboardFocus?: (
    index: RowIndexPath,
    e: React.KeyboardEvent<any>
  ) => void

  /** called when the row (or any of its descendants) receives focus */
  readonly onRowFocus?: (
    index: RowIndexPath,
    e: React.FocusEvent<HTMLDivElement>
  ) => void

  /** called when the row (and all of its descendants) loses focus */
  readonly onRowBlur?: (
    index: RowIndexPath,
    e: React.FocusEvent<HTMLDivElement>
  ) => void

  /** Called back for when the context menu is invoked (user right clicks of
   * uses keyboard shortcuts) */
  readonly onContextMenu?: (
    index: RowIndexPath,
    e: React.MouseEvent<HTMLDivElement>
  ) => void

  /**
   * Whether or not this list row is going to be selectable either through
   * keyboard navigation, pointer clicks, or both. This is used to determine
   * whether or not to present a hover state for the list row.
   */
  readonly selectable: boolean

  /** a custom css class to apply to the row */
  readonly className?: string

  /**
   * aria label value for screen readers
   *
   * Note: you may need to apply an aria-hidden attribute to any child text
   * elements for this to take precedence.
   */
  readonly ariaLabel?: string
}

export class ListRow extends React.Component<IListRowProps, {}> {
  // Since there is no way of knowing when a row has been focused via keyboard
  // or mouse interaction, we will use the keyDown and keyUp events to track
  // what the user did to get the row in a focused state.
  // The heuristic is that we should receive a focus event followed by a keyUp
  // event, with no keyDown events (since that keyDown event should've happened
  // in the component that previously had focus).
  private keyboardFocusDetectionState: 'ready' | 'failed' | 'focused' = 'ready'

  private onRef = (elem: HTMLDivElement | null) => {
    this.props.onRowRef?.(this.props.rowIndex, elem)
  }

  private onRowMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowMouseDown(this.props.rowIndex, e)
  }

  private onRowMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowMouseUp(this.props.rowIndex, e)
  }

  private onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowClick(this.props.rowIndex, e)
  }

  private onRowDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowDoubleClick(this.props.rowIndex, e)
  }

  private onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    this.props.onRowKeyDown(this.props.rowIndex, e)
    this.keyboardFocusDetectionState = 'failed'
  }

  private onRowKeyUp = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (this.keyboardFocusDetectionState === 'focused') {
      this.props.onRowKeyboardFocus?.(this.props.rowIndex, e)
    }
    this.keyboardFocusDetectionState = 'ready'
  }

  private onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    this.props.onRowFocus?.(this.props.rowIndex, e)
    if (this.keyboardFocusDetectionState === 'ready') {
      this.keyboardFocusDetectionState = 'focused'
    }
  }

  private onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    this.keyboardFocusDetectionState = 'ready'
    this.props.onRowBlur?.(this.props.rowIndex, e)
  }

  private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onContextMenu?.(this.props.rowIndex, e)
  }

  public render() {
    const {
      selected,
      selectedForKeyboardInsertion,
      selectable,
      inKeyboardInsertionMode,
      className,
      style,
      rowCount,
      id,
      tabIndex,
      rowIndex,
      children,
      sectionHasHeader,
    } = this.props
    const rowClassName = classNames(
      'list-item',
      {
        selected,
        'in-keyboard-insertion-mode': inKeyboardInsertionMode,
        'selected-for-keyboard-insertion': selectedForKeyboardInsertion,
        'not-selectable': selectable === false,
      },
      className
    )
    // react-virtualized gives us an explicit pixel width for rows, but that
    // width doesn't take into account whether or not the scroll bar needs
    // width too, e.g., on macOS when "Show scroll bars" is set to "Always."
    //
    // *But* the parent Grid uses `autoContainerWidth` which means its width
    // *does* reflect any width needed by the scroll bar. So we should just use
    // that width.
    const fullWidthStyle = { ...style, width: '100%' }

    let ariaSetSize: number | undefined = rowCount
    let ariaPosInSet: number | undefined = rowIndex.row + 1
    if (sectionHasHeader) {
      if (rowIndex.row === 0) {
        ariaSetSize = undefined
        ariaPosInSet = undefined
      } else {
        ariaSetSize -= 1
        ariaPosInSet -= 1
      }
    }

    return (
      <div
        id={id}
        role={
          sectionHasHeader && rowIndex.row === 0 ? 'presentation' : 'option'
        }
        aria-setsize={ariaSetSize}
        aria-posinset={ariaPosInSet}
        aria-selected={selectable ? selected : undefined}
        aria-label={this.props.ariaLabel}
        className={rowClassName}
        tabIndex={tabIndex}
        ref={this.onRef}
        onMouseDown={this.onRowMouseDown}
        onMouseUp={this.onRowMouseUp}
        onClick={this.onRowClick}
        onDoubleClick={this.onRowDoubleClick}
        onKeyDown={this.onRowKeyDown}
        onKeyUp={this.onRowKeyUp}
        style={fullWidthStyle}
        onFocus={this.onFocus}
        onBlur={this.onBlur}
        onContextMenu={this.onContextMenu}
      >
        {
          // HACK: When we have an ariaLabel we need to make sure that the
          // child elements are not exposed to the screen reader, otherwise
          // VoiceOver will decide to read the children elements instead of the
          // ariaLabel.
          <div
            className="list-item-content-wrapper"
            aria-hidden={this.props.ariaLabel !== undefined}
          >
            {children}
          </div>
        }
      </div>
    )
  }
}
