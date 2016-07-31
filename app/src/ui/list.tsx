import * as React from 'react'
const { Grid, AutoSizer } = require('react-virtualized')

interface IListProps {
  rowRenderer: (row: number) => JSX.Element
  rowCount: number
  rowHeight: number
  selectedRow: number
  onSelectionChanged?: (row: number) => void
  canSelectRow?: (row: number) => boolean

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  id?: string
}

export default class List extends React.Component<IListProps, void> {
  public refs: {
    [key: string]: any,
    list: Element
  }

  private selectedItem: HTMLDivElement | null = null
  /**
   * Internal use only. Whether to explicitly move keyboard focus to the selected item.
   * Used after intercepting keyboard intent to move selection (arrow keys, page up/down).
   */
  private moveKeyboardFocusToSelectedItem = false

  private handleKeyDown(e: React.KeyboardEvent) {
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

    this.moveKeyboardFocusToSelectedItem = true
  }

  private scrollRowToVisible(row: number) {
    const top = row * this.props.rowHeight
    const bottom = top + this.props.rowHeight
    const list = this.refs.list
    const rangeStart = list.scrollTop
    const rangeEnd = list.scrollTop + list.clientHeight

    if (top < rangeStart) {
      this.refs.list.scrollTop = top
    } else if (bottom > rangeEnd) {
      this.refs.list.scrollTop = bottom - list.clientHeight
    }
  }

  public componentDidUpdate() {
    // If this state is set it means that someone just used arrow keys (or pgup/down)
    // to change the selected row. When this happens we need to explcitly shift
    // keyboard focus to the newly selected item. If selectedItem is null then
    // we're probably just loading more items and we'll catch it on the next
    // render pass.
    if (this.moveKeyboardFocusToSelectedItem) {
      if (this.selectedItem) {
        this.selectedItem.focus()
      }
      // Unset the flag so that we don't end up in a loop setting focus over and over.
      this.moveKeyboardFocusToSelectedItem = false
    }
  }

  private renderRow = ({ rowIndex }: { rowIndex: number }) => {

    const selected = rowIndex === this.props.selectedRow
    const className = selected ? 'list-item selected' : 'list-item'
    const tabIndex = selected ? 0 : -1

    // We don't care about mouse events on the selected item
    const onMouseDown = selected ? null : () => this.handleMouseDown(rowIndex)

    // We only need to keep a reference to the selected element
    const ref = selected
      ? (c: HTMLDivElement) => { this.selectedItem = c }
      : null

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
    const className = 'list list-virtualized'
    // The currently selected list item is focusable but if
    // there's no focused item (and there's items to switch between)
    // the list itself needs to be focusable so that you can reach
    // it with keyboard navigation and select an item.
    const tabIndex = (this.props.selectedRow < 0 && this.props.rowCount > 0) ? 0 : -1
    return (
      <div id={this.props.id}
           className={className}
           ref='list'
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
              // Grid doesn't actually _do_ anything with
              // `selectedRow`. We're just passing it through so that
              // Grid will re-render when it changes.
              selectedRow={this.props.selectedRow}/>
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
}
