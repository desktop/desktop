import * as React from 'react'
const { Grid, AutoSizer } = require('react-virtualized')

interface IListProps {
  rowRenderer: (row: number) => JSX.Element
  rowCount: number
  rowHeight: number
  selectedRow: number
  onSelectionChanged?: (row: number) => void
  canSelectRow?: (row: number) => boolean
  onScroll?: (scrollTop: number, clientHeight: number) => void

  /**
   * List's underlying implementation acts as a pure component based on the
   * above props. So if there are any other properties that also determine
   * whether the list should re-render, List must know about them.
   */
  invalidationProps?: any

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  id?: string
}

export default class List extends React.Component<IListProps, void> {
  private focusItem: HTMLDivElement | null = null

  private scrollToRow = -1
  private focusRow = -1

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

  private nextSelectableRow(direction: 'up' | 'down', row: number): number {
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

    if (this.props.canSelectRow) {
      if (this.props.canSelectRow(newRow)) {
        return newRow
      } else {
        return this.nextSelectableRow(direction, newRow)
      }
    } else {
      return newRow
    }
  }

  private moveSelection(direction: 'up' | 'down') {
    const newRow = this.nextSelectableRow(direction, this.props.selectedRow)

    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(newRow)
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
    const tabIndex = focused ? 0 : -1

    // We don't care about mouse events on the selected item
    const onMouseDown = selected ? undefined : () => this.handleMouseDown(rowIndex)

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
           onMouseDown={onMouseDown}>
        {element}
      </div>
    )
  }

  public render() {
    const scrollToRow = this.scrollToRow
    this.scrollToRow = -1

    // The currently selected list item is focusable but if
    // there's no focused item (and there's items to switch between)
    // the list itself needs to be focusable so that you can reach
    // it with keyboard navigation and select an item.
    const tabIndex = (this.props.selectedRow < 0 && this.props.rowCount > 0) ? 0 : -1
    return (
      <div id={this.props.id}
           className='list'
           tabIndex={tabIndex}
           onKeyDown={e => this.handleKeyDown(e)}
           style={{ flexGrow: 1 }}>
        <AutoSizer>
          {({ width, height }: { width: number, height: number }) => (
            <Grid
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
    if (this.props.selectedRow !== row) {
      let canSelect = true
      if (this.props.canSelectRow) {
        canSelect = this.props.canSelectRow(row)
      }

      if (canSelect && this.props.onSelectionChanged) {
        this.props.onSelectionChanged(row)
      }
    }
  }

  private onScroll = ({ scrollTop, clientHeight }: { scrollTop: number, clientHeight: number }) => {
    if (this.props.onScroll) {
      this.props.onScroll(scrollTop, clientHeight)
    }
  }
}
