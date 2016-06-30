import * as React from 'react'
import * as ReactDOM from 'react-dom'

type ListProps = {
  renderItem: (row: number) => JSX.Element,
  itemCount: number,
  itemHeight: number,
  selectedRow: number,
  onSelectionChanged?: (row: number) => void,

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  id?: string
}

type ListState = {
  scrollPosition: number,
  numberOfItemsToRender: number,

  /**
   * Internal use only. Whether to explicitly move keyboard focus to the selected item.
   * Used after intercepting keyboard intent to move selection (arrow keys, page up/down).
   */
   moveKeyboardFocusToSelectedItem?: boolean
}

export default class List extends React.Component<ListProps, ListState> {
  public refs: {
    [key: string]: any,
    list: Element
  }

  private firstRender: boolean
  private selectedItem: HTMLDivElement

  public constructor(props: ListProps) {
    super(props)

    this.firstRender = true

    this.state = {scrollPosition: 0, numberOfItemsToRender: 0}
  }

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

  private moveSelection(direction: 'up' | 'down') {
    let newRow = this.props.selectedRow
    if (direction === 'up') {
      newRow = this.props.selectedRow - 1
      if (newRow < 0) {
        newRow = this.props.itemCount - 1
      }
    } else {
      newRow = this.props.selectedRow + 1
      if (newRow > this.props.itemCount - 1) {
        newRow = 0
      }
    }

    this.props.onSelectionChanged(newRow)
    this.setState(Object.assign({}, this.state, {moveKeyboardFocusToSelectedItem: true}))
    this.scrollRowToVisible(newRow)
  }

  private scrollRowToVisible(row: number) {
    const top = row * this.props.itemHeight
    const bottom = top + this.props.itemHeight
    const list = this.refs.list
    const rangeStart = list.scrollTop
    const rangeEnd = list.scrollTop + list.clientHeight

    if (top < rangeStart) {
      this.refs.list.scrollTop = top
    } else if (bottom > rangeEnd) {
      this.refs.list.scrollTop = bottom - list.clientHeight
    }
  }

  private updateScrollPosition() {
    const newScrollPosition = Math.round(this.refs.list.scrollTop / this.props.itemHeight)
    const difference = Math.abs(this.state.scrollPosition - newScrollPosition)

    if (difference >= this.state.numberOfItemsToRender / 5) {
      this.setState({scrollPosition: newScrollPosition, numberOfItemsToRender: this.state.numberOfItemsToRender})
    }
  }

  private renderItems(startPosition: number, endPosition: number): JSX.Element[] {
    const items: JSX.Element[] = []

    // While it's currently impossible to deselect an item we unset
    // this in case we decide to add deselection in the future. Windows
    // lists, for example, always support deselection with CTLR+Click.
    this.selectedItem = null

    for (let row = startPosition; row < endPosition; row++) {
      const element = this.props.renderItem(row)
      const selected = row === this.props.selectedRow
      const className = selected ? 'list-item selected' : 'list-item'
      const tabIndex = selected ? '0' : null

      // We only need to keep a reference to the selected element
      const ref = selected
        ? (c: HTMLDivElement) => { this.selectedItem = c }
        : null

      items.push(
        <div key={element.key}
             className={className}
             tabIndex={tabIndex}
             ref={ref}
             style={{
               transform: `translate3d(0px, ${row * this.props.itemHeight}px, 0px)`,
               height: this.props.itemHeight
             }}
             onMouseDown={() => this.handleMouseDown(row)}>
          {element}
        </div>
      )
    }

    return items
  }

  public componentDidUpdate() {
    this.updateVisibleRows()

    // If this state is set it means that someone just used arrow keys (or pgup/down)
    // to change the selected row. When this happens we need to explcitly shift
    // keyboard focus to the newly selected item.
    if (this.state.moveKeyboardFocusToSelectedItem) {
      if (this.selectedItem) {
        this.selectedItem.focus()
      }

      // Unset the flag so that we don't end up in a loop setting focus over and over.
      this.setState(Object.assign({}, this.state, {moveKeyboardFocusToSelectedItem: false}))
    }
  }

  private updateVisibleRows() {
    const element = ReactDOM.findDOMNode(this)
    const numberOfVisibleRows = Math.ceil(element.clientHeight / this.props.itemHeight)
    const numberOfRowsToRender = numberOfVisibleRows * 3
    if (numberOfRowsToRender !== this.state.numberOfItemsToRender) {
      this.setState({scrollPosition: this.state.scrollPosition, numberOfItemsToRender: numberOfRowsToRender})
    }
  }

  public render() {
    const startPosition = Math.max(this.state.scrollPosition - this.state.numberOfItemsToRender, 0)
    const endPosition = Math.min(this.state.scrollPosition + this.state.numberOfItemsToRender, this.props.itemCount)
    const containerStyle = {
      position: 'relative',
      overflow: 'hidden',
      height: this.props.itemHeight * this.props.itemCount
    }

    if (this.firstRender) {
      // We don't know how tall we are until we've rendered. So the first time
      // we render, we'll need to do it again :\
      process.nextTick(() => this.updateVisibleRows())
    }

    this.firstRender = false

    const className = 'list list-virtualized'

    // The currently selected list item is focusable but if
    // there's no focused item (and there's items to switch between)
    // the list itself needs to be focusable so that you can reach
    // it with keyboard navigation and select an item.
    const tabIndex = (this.props.selectedRow < 0 && this.props.itemCount > 0) ? 0 : -1

    return (
      <div id={this.props.id}
           className={className}
           ref='list'
           tabIndex={tabIndex}
           onScroll={() => this.updateScrollPosition()}
           onKeyDown={e => this.handleKeyDown(e)}>
        <div style={containerStyle}>
          {this.renderItems(startPosition, endPosition)}
        </div>
      </div>
    )
  }

  private handleMouseDown(row: number) {
    this.props.onSelectionChanged(row)
  }
}
