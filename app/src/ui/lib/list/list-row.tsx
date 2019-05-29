import * as React from 'react'
import * as classNames from 'classnames'

interface IListRowProps {
  /** the total number of row in this list */
  readonly rowCount: number

  /** the index of the row in the list */
  readonly rowIndex: number

  /** the accessibility mode to assign to the row */
  readonly ariaMode?: 'list' | 'menu'

  /** custom styles to provide to the row */
  readonly style?: React.CSSProperties

  /** set a tab index for this row (if selectable) */
  readonly tabIndex?: number

  /** an optional id to provide to the element */
  readonly id?: string

  /** whether the row should be rendered as selected */
  readonly selected?: boolean

  /** callback to fire when the DOM element is created */
  readonly onRef?: (element: HTMLDivElement | null) => void

  /** callback to fire when the row receives a mouseover event */
  readonly onRowMouseOver: (index: number, e: React.MouseEvent<any>) => void

  /** callback to fire when the row receieves a mousedown event */
  readonly onRowMouseDown: (index: number, e: React.MouseEvent<any>) => void

  /** callback to fire when the row is clicked */
  readonly onRowClick: (index: number, e: React.MouseEvent<any>) => void

  /** callback to fire when the row receives a keyboard event */
  readonly onRowKeyDown: (index: number, e: React.KeyboardEvent<any>) => void

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
  private onRowMouseOver = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowMouseOver(this.props.rowIndex, e)
  }

  private onRowMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowMouseDown(this.props.rowIndex, e)
  }

  private onRowClick = (e: React.MouseEvent<HTMLDivElement>) => {
    this.props.onRowClick(this.props.rowIndex, e)
  }

  private onRowKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    this.props.onRowKeyDown(this.props.rowIndex, e)
  }

  public render() {
    const selected = this.props.selected
    const className = classNames(
      'list-item',
      { selected },
      { 'not-selectable': this.props.selectable === false },
      this.props.className
    )
    const role = this.props.ariaMode === 'menu' ? 'menuitem' : 'option'

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
        aria-setsize={this.props.rowCount}
        aria-posinset={this.props.rowIndex + 1}
        aria-selected={this.props.selected}
        role={role}
        className={className}
        tabIndex={this.props.tabIndex}
        ref={this.props.onRef}
        onMouseOver={this.onRowMouseOver}
        onMouseDown={this.onRowMouseDown}
        onClick={this.onRowClick}
        onKeyDown={this.onRowKeyDown}
        style={style}
      >
        {this.props.children}
      </div>
    )
  }
}
