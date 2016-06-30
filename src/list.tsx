import * as React from 'react'
import * as ReactDOM from 'react-dom'

type ListProps = {
  renderItem: (row: number) => JSX.Element,
  itemCount: number,
  itemHeight: number,
  selectedRow?: number,
  onSelectionChanged?: (row: number) => void,
  style?: Object,

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  id?: string
}

type ListState = {
  scrollPosition: number,
  numberOfItemsToRender: number
}

export default class List extends React.Component<ListProps, ListState> {
  public refs: {
    [key: string]: any,
    list: Element
  }

  private firstRender: boolean

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
    for (let row = startPosition; row < endPosition; row++) {
      const element = this.props.renderItem(row)
      const selected = row === this.props.selectedRow
      const className = selected ? 'list-item selected' : 'list-item'

      items.push(
        <div key={element.key} className={className}
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
    const listRequiredStyle = {
      overflow: 'auto',
      transform: 'translate3d(0, 0, 0)'
    }
    const listStyle = Object.assign({}, this.props.style, listRequiredStyle)
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

    return (
      <div id={this.props.id}
           style={listStyle}
           className={className}
           ref='list'
           tabIndex={-1}
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
