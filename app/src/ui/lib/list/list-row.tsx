import * as React from 'react'
import classNames from 'classnames'
import { RowIndexPath } from './list'

interface IListRowProps {
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
}

export class ListRow extends React.Component<IListRowProps, {}> {
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
  }

  private onFocus = (e: React.FocusEvent<HTMLDivElement>) => {
    this.props.onRowFocus?.(this.props.rowIndex, e)
  }

  private onBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    this.props.onRowBlur?.(this.props.rowIndex, e)
  }

  private onContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onContextMenu?.(this.props.rowIndex, e)
  }

  public render() {
    const selected = this.props.selected
    const className = classNames(
      'list-item',
      { selected },
      { 'not-selectable': this.props.selectable === false },
      this.props.className
    )
    // react-virtualized gives us an explicit pixel width for rows, but that
    // width doesn't take into account whether or not the scroll bar needs
    // width too, e.g., on macOS when "Show scroll bars" is set to "Always."
    //
    // *But* the parent Grid uses `autoContainerWidth` which means its width
    // *does* reflect any width needed by the scroll bar. So we should just use
    // that width.
    const style = { ...this.props.style, width: '100%' }

    return (
      <div
        id={this.props.id}
        role="option"
        aria-setsize={this.props.rowCount}
        aria-posinset={this.props.rowIndex.row + 1}
        aria-selected={this.props.selectable ? this.props.selected : undefined}
        className={className}
        tabIndex={this.props.tabIndex}
        ref={this.onRef}
        onMouseDown={this.onRowMouseDown}
        onMouseUp={this.onRowMouseUp}
        onClick={this.onRowClick}
        onDoubleClick={this.onRowDoubleClick}
        onKeyDown={this.onRowKeyDown}
        style={style}
        onFocus={this.onFocus}
        onBlur={this.onBlur}
        onContextMenu={this.onContextMenu}
      >
        {this.props.children}
      </div>
    )
  }
}
