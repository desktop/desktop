import * as React from 'react'
const { Grid, AutoSizer } = require('react-virtualized')

interface IListProps {
  readonly rowRenderer: (row: number) => JSX.Element
  readonly rowCount: number
  readonly rowHeight: number
  readonly selectedRow: number

  /**
   * This function will be called when a row is selected, either by being
   * clicked on or by keyboard navigation.
   */
  readonly onRowSelected?: (row: number) => void

  /**
   * This function will be called when the selection changes. Note that this
   * differs from `onRowSelected`. For example, it won't be called if an already
   * selected row is clicked on.
   */
  readonly onSelectionChanged?: (row: number) => void

  /**
   * A handler called whenever a key down event is received on the
   * row container element. Due to the way the container is currently
   * implemented the element produced by the rowRendered will never
   * see keyboard events without stealing focus away from the container.
   *
   * Primary use case for this is to allow items to react to the space
   * bar in order to toggle selection. This function is responsible
   * for calling event.preventDefault() when acting on a key press.
   */
  onRowKeyDown?: (row: number, event: React.KeyboardEvent<any>) => void

  readonly canSelectRow?: (row: number) => boolean
  readonly onScroll?: (scrollTop: number, clientHeight: number) => void

  /**
   * List's underlying implementation acts as a pure component based on the
   * above props. So if there are any other properties that also determine
   * whether the list should re-render, List must know about them.
   */
  readonly invalidationProps?: any

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  readonly id?: string

  /** The row that should be scrolled to when the list is rendered. */
  readonly scrollToRow?: number
}

export default class List extends React.Component<IListProps, void> {
  private focusItem: HTMLDivElement | null = null

  private scrollToRow = -1
  private focusRow = -1

  private grid: React.Component<any, any> | null

  private handleKeyDown(e: React.KeyboardEvent<any>) {
    let direction: 'up' | 'down'
    if (e.key === 'ArrowDown') {
      direction = 'down'
    } else if (e.key === 'ArrowUp') {
      direction = 'up'
    } else {
      return
    }

    this.moveSelection(direction)

    e.preventDefault()
  }

  private handleRowKeyDown(rowIndex: number, e: React.KeyboardEvent<any>) {
    if (this.props.onRowKeyDown) {
      this.props.onRowKeyDown(rowIndex, e)
    }
  }

  /**
   * Determine the next selectable row, given the direction and row. This will
   * take `canSelectRow` into account.
   */
  public nextSelectableRow(direction: 'up' | 'down', row: number): number {
    let newRow = row
    if (direction === 'up') {
      newRow = row - 1
      if (newRow < 0) {
        newRow = this.props.rowCount - 1
      }
    } else {
      newRow = row + 1
      if (newRow > this.props.rowCount - 1) {
        newRow = 0
      }
    }

    if (this.canSelectRow(newRow)) {
      return newRow
    } else {
      return this.nextSelectableRow(direction, newRow)
    }
  }

  /** Convenience method for invoking canSelectRow callback when it exists */
  private canSelectRow(rowIndex: number) {
    return this.props.canSelectRow
      ? this.props.canSelectRow(rowIndex)
      : true
  }

  private moveSelection(direction: 'up' | 'down') {
    const newRow = this.nextSelectableRow(direction, this.props.selectedRow)

    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(newRow)
    }

    if (this.props.onRowSelected) {
      this.props.onRowSelected(newRow)
    }

    this.scrollRowToVisible(newRow)
  }

  private scrollRowToVisible(row: number) {
    this.scrollToRow = row
    this.focusRow = row
    this.forceUpdate()
  }

  public componentDidUpdate() {
    // If this state is set it means that someone just used arrow keys (or pgup/down)
    // to change the selected row. When this happens we need to explcitly shift
    // keyboard focus to the newly selected item. If focusItem is null then
    // we're probably just loading more items and we'll catch it on the next
    // render pass.
    if (this.focusRow >= 0 && this.focusItem) {
      this.focusItem.focus()
      this.focusRow = -1
      this.forceUpdate()
    }
  }

  private renderRow = ({ rowIndex }: { rowIndex: number }) => {
    const selected = rowIndex === this.props.selectedRow
    const focused = rowIndex === this.focusRow
    const className = selected ? 'list-item selected' : 'list-item'
    const tabIndex = selected ? 0 : -1

    // We only need to keep a reference to the focused element
    const ref = focused
      ? (c: HTMLDivElement) => { this.focusItem = c }
      : undefined

    const element = this.props.rowRenderer(rowIndex)
    return (
      <div key={element.key}
           role='button'
           className={className}
           tabIndex={tabIndex}
           ref={ref}
           onMouseDown={() => this.handleMouseDown(rowIndex)}
           onKeyDown={(e) => this.handleRowKeyDown(rowIndex, e)}>
        {element}
      </div>
    )
  }

  public render() {
    let scrollToRow = this.props.scrollToRow
    if (scrollToRow === undefined) {
      scrollToRow = this.scrollToRow
    }
    this.scrollToRow = -1

    // The currently selected list item is focusable but if
    // there's no focused item (and there's items to switch between)
    // the list itself needs to be focusable so that you can reach
    // it with keyboard navigation and select an item.
    const tabIndex = (this.props.selectedRow < 0 && this.props.rowCount > 0) ? 0 : null
    return (
      <div id={this.props.id}
           className='list'
           onKeyDown={e => this.handleKeyDown(e)}>
        <AutoSizer>
          {({ width, height }: { width: number, height: number }) => (
            <Grid
              ref={(ref: React.Component<any, any>) => this.grid = ref}
              autoContainerWidth
              width={width}
              height={height}
              // Hack:
              // The autosizer doesn't take custom scrollbars into account and
              // will thus give us the outer dimensions of the list. Our items,
              // however simply can't render all the way out to the edge due
              // to limitations in webkit custom scrollbars which enforces a
              // padding. This results in content being clipped. By reducing
              // the width of columns (rows in our case) we avoid rendering
              // where our scrollbar clips us. See also _scroll.scss.
              columnWidth={width - 10}
              columnCount={1}
              rowCount={this.props.rowCount}
              rowHeight={this.props.rowHeight}
              cellRenderer={this.renderRow}
              onScroll={this.onScroll}
              scrollToRow={scrollToRow}
              overscanRowCount={4}
              tabIndex={tabIndex}
              // Grid doesn't actually _do_ anything with
              // `selectedRow`. We're just passing it through so that
              // Grid will re-render when it changes.
              selectedRow={this.props.selectedRow}
              invalidationProps={this.props.invalidationProps}/>
          )}
        </AutoSizer>
      </div>
    )
  }

  private handleMouseDown = (row: number) => {
    if (this.canSelectRow(row)) {
      if (row !== this.props.selectedRow && this.props.onSelectionChanged) {
        this.props.onSelectionChanged(row)
      }

      if (this.props.onRowSelected) {
        this.props.onRowSelected(row)
      }
    }
  }

  private onScroll = ({ scrollTop, clientHeight }: { scrollTop: number, clientHeight: number }) => {
    if (this.props.onScroll) {
      this.props.onScroll(scrollTop, clientHeight)
    }
  }

  public forceUpdate(callback?: () => any) {
    super.forceUpdate(callback)

    const grid = this.grid
    if (grid) {
      grid.forceUpdate()
    }
  }
}
