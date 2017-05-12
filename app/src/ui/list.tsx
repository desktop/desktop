import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as classNames from 'classnames'
import { Grid, AutoSizer } from 'react-virtualized'
import { shallowEquals } from '../lib/equality'

/**
 * Describe the first argument given to the cellRenderer,
 * See
 *  https://github.com/bvaughn/react-virtualized/issues/386
 *  https://github.com/bvaughn/react-virtualized/blob/8.0.11/source/Grid/defaultCellRangeRenderer.js#L38-L44
 */
export interface IRowRendererParams {
  /** Horizontal (column) index of cell */
  readonly columnIndex: number

  /** The Grid is currently being scrolled */
  readonly isScrolling: boolean

  /** Unique key within array of cells */
  readonly key: React.Key

  /** Vertical (row) index of cell */
  readonly rowIndex: number

  /** Style object to be applied to cell */
  readonly style: React.CSSProperties
}

/**
 * Interface describing a user initiated selection change event
 * originating from a pointer device clicking or pressing on an item.
 */
export interface IMouseClickSource {
  readonly kind: 'mouseclick',
  readonly event: React.MouseEvent<any>
}

/**
 * Interface describing a user initiated selection change event
 * originating from a pointer device hovering over an item.
 * Only applicable when selectedOnHover is set.
 */
export interface IHoverSource {
  readonly kind: 'hover',
  readonly event: React.MouseEvent<any>
}

/**
 * Interface describing a user initiated selection change event
 * originating from a keyboard
 */
export interface IKeyboardSource {
  readonly kind: 'keyboard',
  readonly event: React.KeyboardEvent<any>
}

/** A type union of possible sources of a selection changed event */
export type SelectionSource =
  IMouseClickSource |
  IHoverSource |
  IKeyboardSource


export type ClickSource =
  IMouseClickSource |
  IKeyboardSource

interface IListProps {
  /**
   * Mandatory callback for rendering the contents of a particular
   * row. The callback is not responsible for the outer wrapper
   * of the row, only its contents and may return null although
   * that will result in an empty list item.
   */
  readonly rowRenderer: (row: number) => JSX.Element | null

  /**
   * The total number of rows in the list. This is used for
   * scroll virtualization purposes when calculating the theoretical
   * height of the list.
   */
  readonly rowCount: number

  /**
   * The height of each individual row in the list. This height
   * is enforced for each row container and attempting to render a row
   * which does not fit inside that height is forbidden.
   *
   * Can either be a number (most efficient) in which case all rows
   * are of equal height, or, a function that, given a row index returns
   * the height of that particular row.
   */
  readonly rowHeight: number | ((info: { index: number }) => number)

  /**
   * The currently selected row index. Used to attach a special
   * selection class on that row container as well as being used
   * for keyboard selection.
   */
  readonly selectedRow: number

  /**
   * This function will be called when a pointer device is pressed and then
   * released on a selectable row. Note that this follows the conventions
   * of button elements such that pressing Enter or Space on a keyboard
   * while focused on a particular row will also trigger this event. Consumers
   * can differentiate between the two using the source parameter.
   *
   * Note that this event handler will not be called for keyboard events
   * if event.preventDefault was called in the onRowKeyDown event handler.
   *
   * Consumers of this event do _not_ have to call event.preventDefault,
   * when this event is subscribed to the list will automatically call it.
   */
  readonly onRowClick?: (row: number, soure: ClickSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). Note that this
   * differs from `onRowSelected`. For example, it won't be called if an already
   * selected row is clicked on.
   *
   * @param row    - The index of the row that was just selected
   * @param source - The kind of user action that provoked the change, either
   *                 a pointer device press, hover (if selectOnHover is set) or
   *                 a keyboard event (arrow up/down)
   */
  readonly onSelectionChanged?: (row: number, source: SelectionSource) => void

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
  readonly onRowKeyDown?: (row: number, event: React.KeyboardEvent<any>) => void

  /**
   * An optional handler called to determine whether a given row is
   * selectable or not. Reasons for why a row might not be selectable
   * includes it being a group header or the item being disabled.
   */
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

  /** Whether or not selection should follow pointer device */
  readonly selectOnHover?: boolean

  /** 
   * Whether or not to explicitly move focus to a row if it was selected
   * by hovering (has no effect if selectOnHover is not set). Defaults to
   * true if not defined.
   */
  readonly focusOnHover?: boolean
}

interface IListState {
  /** The available height for the list as determined by ResizeObserver */
  readonly height?: number

  /** The available width for the list as determined by ResizeObserver */
  readonly width?: number
}

// https://wicg.github.io/ResizeObserver/#resizeobserverentry
interface IResizeObserverEntry {
  readonly target: HTMLElement
  readonly contentRect: ClientRect
};

export class List extends React.Component<IListProps, IListState> {
  private focusItem: HTMLDivElement | null = null
  private fakeScroll: HTMLDivElement | null = null

  private scrollToRow = -1
  private focusRow = -1

  /**
   * The style prop for our child Grid. We keep this here in order
   * to not create a new object on each render and thus forcing
   * the Grid to re-render even though nothing has changed.
   */
  private gridStyle: React.CSSProperties = { overflowX: 'hidden' }

  /**
   * On Win32 we use a fake scroll bar. This variable keeps track of
   * which of the actual scroll container and the fake scroll container
   * received the scroll event first to avoid bouncing back and forth
   * causing jerky scroll bars and more importantly making the mouse
   * wheel scroll speed appear different when scrolling over the
   * fake scroll bar and the actual one.
   */
  private lastScroll: 'grid' | 'fake' | null = null

  private list: HTMLDivElement | null = null
  private grid: React.Component<any, any> | null
  private readonly resizeObserver: any | null = null
  private updateSizeTimeoutId: number | null = null

  public constructor(props: IListProps) {
    super(props)

    this.state = { }

    const ResizeObserver = (window as any).ResizeObserver

    if (ResizeObserver || false) {
      this.resizeObserver = new ResizeObserver((entries: ReadonlyArray<IResizeObserverEntry>) => {
        for (const entry of entries) {
          if (entry.target === this.list) {
            // We might end up causing a recursive update by updating the state
            // when we're reacting to a resize so we'll defer it until after
            // react is done with this frame.
            if (this.updateSizeTimeoutId !== null) {
              clearImmediate(this.updateSizeTimeoutId)
            }

            this.updateSizeTimeoutId = setImmediate(this.onResized, entry.target, entry.contentRect)
          }
        }
      })
    }
  }

  private onResized = (target: HTMLElement, contentRect: ClientRect) => {
    this.updateSizeTimeoutId = null

    // In a perfect world the contentRect would be enough. Unfortunately,
    // as you already know, computers. In Electron 1.6.6 (with Chrome 56) which
    // we're running at the time of writing the clientRect emitted from the
    // resizeObserver returns native pixels instead of device independent pixels
    // which means that the width and height will end up being 2x the expected
    // size when running in 200% DPI scaling on Windows. On Mac this doesn't
    // seem to be an issue. It's not clear to me whether this bug lies within
    // Electron or Chromium and it's quite possible that it's solved already in
    // newer versions of Chromium so we'll should revisit this as we upgrade.
    //
    // It's worth noting that the ResizeObserver is still behind the
    // experimental flag so things like this should probably be expected.
    //
    // In order to work around this on Windows we'll explicitly ask for a
    // bounding rectangle on Windows which we know will give us sane pixels.
    const { width, height } = __DARWIN__
      ? contentRect
      : { width: target.offsetWidth, height: target.offsetHeight }

    if (this.state.width !== width || this.state.height !== height) {
      this.setState({ width, height })
    }
  }

  private onRef = (element: HTMLDivElement | null) => {

    this.list = element

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()

      if (element) {
        this.resizeObserver.observe(element)
      } else {
        this.setState({ width: undefined, height: undefined })
      }
    }
  }

  private handleKeyDown = (event: React.KeyboardEvent<any>) => {
    const row = this.props.selectedRow
    if (row >= 0 && this.props.onRowKeyDown) {
      this.props.onRowKeyDown(row, event)
    }

    // The consumer is given a change to prevent the default behavior for
    // keyboard navigation so that they can customize its behavior as needed.
    if (event.defaultPrevented) { return }

    if (event.key === 'ArrowDown') {
      this.moveSelection('down', event)
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      this.moveSelection('up', event)
      event.preventDefault()
    }
  }

  private handleRowKeyDown(rowIndex: number, event: React.KeyboardEvent<any>) {
    if (this.props.onRowKeyDown) {
      this.props.onRowKeyDown(rowIndex, event)
    }

    // We give consumers the power to prevent the onRowClick event by subscribing
    // to the onRowKeyDown event and calling event.preventDefault. This lets
    // consumers add their own semantics for keyboard presses.
    if (!event.defaultPrevented && this.props.onRowClick) {
      if (event.key === 'Enter' || event.key === ' ') {
        this.props.onRowClick(rowIndex, { kind: 'keyboard', event })
        event.preventDefault()
      }
    }
  }

  private onRowMouseOver = (row: number, event: React.MouseEvent<any>) => {
    if (this.props.selectOnHover && this.canSelectRow(row)) {
      if (row !== this.props.selectedRow && this.props.onSelectionChanged) {
        this.props.onSelectionChanged(row, { kind: 'hover', event })
        // By calling scrollRowToVisible we ensure that hovering over a partially
        // visible item at the top or bottom of the list scrolls it into view but
        // more importantly `scrollRowToVisible` automatically manages focus so
        // using it here allows us to piggy-back on its focus-preserving magic
        // even though we could theoretically live without scrolling
        this.scrollRowToVisible(row)
      }
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

  private moveSelection(direction: 'up' | 'down', event: React.KeyboardEvent<any>) {
    const newRow = this.nextSelectableRow(direction, this.props.selectedRow)

    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(newRow, { kind: 'keyboard', event })
    }

    this.scrollRowToVisible(newRow)
  }

  private scrollRowToVisible(row: number) {
    this.scrollToRow = row

    if (this.props.focusOnHover !== false) {
      this.focusRow = row
    }

    this.forceUpdate()
  }

  public componentDidUpdate(prevProps: IListProps, prevState: IListState) {
    // If this state is set it means that someone just used arrow keys (or pgup/down)
    // to change the selected row. When this happens we need to explicitly shift
    // keyboard focus to the newly selected item. If focusItem is null then
    // we're probably just loading more items and we'll catch it on the next
    // render pass.
    if (this.focusRow >= 0 && this.focusItem) {
      this.focusItem.focus()
      this.focusRow = -1
      this.forceUpdate()
    } else if (this.grid) {

      // A non-exhaustive set of checks to see if our current update has already
      // triggered a re-render of the Grid. In order to do this perfectly we'd
      // have to do a shallow compare on all the props we pass to Grid but
      // this should cover the majority of cases.
      const gridHasUpdatedAlready =
        this.props.rowCount !== prevProps.rowCount ||
        this.state.width !== prevState.width ||
        this.state.height !== prevState.height

      if (!gridHasUpdatedAlready) {
        const selectedRowChanged = prevProps.selectedRow !== this.props.selectedRow
        const invalidationPropsChanged = !shallowEquals(
            prevProps.invalidationProps, this.props.invalidationProps)

        // Now we need to figure out whether anything changed in such a way that
        // the Grid has to update regardless of its props. Previously we passed
        // our selectedRow and invalidationProps down to Grid and figured that
        // it, being a pure component, would do the right thing but that's not
        // quite the case since invalidationProps is a complex object.
        if (selectedRowChanged || invalidationPropsChanged) {
          this.grid.forceUpdate()
        }
      }
    }
  }

  public componentWillUnmount() {

    if (this.updateSizeTimeoutId !== null) {
      clearImmediate(this.updateSizeTimeoutId)
      this.updateSizeTimeoutId = null
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }
  }

  private onFocusedItemRef = (element: HTMLDivElement | null) => {
    this.focusItem = element
  }

  private renderRow = (params: IRowRendererParams) => {
    const rowIndex = params.rowIndex
    const selectable = this.canSelectRow(rowIndex)
    const selected = rowIndex === this.props.selectedRow
    const focused = rowIndex === this.focusRow
    const className = classNames('list-item', { selected })

    // An unselectable row shouldn't be focusable
    let tabIndex: number | undefined = undefined
    if (selectable) {
      tabIndex = selected ? 0 : -1
    }

    // We only need to keep a reference to the focused element
    const ref = focused
      ? this.onFocusedItemRef
      : undefined

    const element = this.props.rowRenderer(params.rowIndex)
    const role = selectable ? 'button' : undefined

    // react-virtualized gives us an explicit pixel width for rows, but that
    // width doesn't take into account whether or not the scroll bar needs
    // width too, e.g., on macOS when "Show scroll bars" is set to "Always."
    //
    // *But* the parent Grid uses `autoContainerWidth` which means its width
    // *does* reflect any width needed by the scroll bar. So we should just use
    // that width.
    const style = { ...params.style, width: '100%' }

    return (
      <div key={params.key}
           role={role}
           className={className}
           tabIndex={tabIndex}
           ref={ref}
           onMouseOver={(e) => this.onRowMouseOver(rowIndex, e)}
           onMouseDown={(e) => this.handleMouseDown(rowIndex, e)}
           onClick={(e) => this.onRowClick(rowIndex, e)}
           onKeyDown={(e) => this.handleRowKeyDown(rowIndex, e)}
           style={style}>
        {element}
      </div>
    )
  }

  public render() {

    let content: JSX.Element[] | JSX.Element | null

    if (this.resizeObserver) {
      content = this.state.width && this.state.height
        ? this.renderContents(this.state.width, this.state.height)
        : null
    } else {
      // Legacy in the event that we don't have ResizeObserver
      content =
        <AutoSizer disableWidth disableHeight>
          {({ width, height }: { width: number, height: number }) => this.renderContents(width, height)}
        </AutoSizer>
    }

    return (
      <div
        ref={this.onRef}
        id={this.props.id}
        className='list'
        onKeyDown={this.handleKeyDown}
      >
        {content}
      </div>
    )
  }

  /**
   * Renders the react-virtualized Grid component and optionally
   * a fake scroll bar component if running on Windows.
   *
   * @param {width} - The width of the Grid as given by AutoSizer
   * @param {height} - The height of the Grid as given by AutoSizer
   *
   */
  private renderContents(width: number, height: number) {

    if (__WIN32__) {
      return [
        this.renderGrid(width, height),
        this.renderFakeScroll(height),
      ]
    }

    return this.renderGrid(width, height)
  }

  private onGridRef = (ref: React.Component<any, any>) => {
    this.grid = ref
  }

  private onFakeScrollRef = (ref: HTMLDivElement) => {
    this.fakeScroll = ref
  }

  /**
   * Renders the react-virtualized Grid component
   *
   * @param {width} - The width of the Grid as given by AutoSizer
   * @param {height} - The height of the Grid as given by AutoSizer
   */
  private renderGrid(width: number, height: number) {
    let scrollToRow = this.props.scrollToRow
    if (scrollToRow === undefined) {
      scrollToRow = this.scrollToRow
    }
    this.scrollToRow = -1

    // The currently selected list item is focusable but if
    // there's no focused item (and there's items to switch between)
    // the list itself needs to be focusable so that you can reach
    // it with keyboard navigation and select an item.
    const tabIndex = (this.props.selectedRow < 0 && this.props.rowCount > 0) ? 0 : -1

    return (
      <Grid
        key='grid'
        ref={this.onGridRef}
        autoContainerWidth
        width={width}
        height={height}
        columnWidth={width}
        columnCount={1}
        rowCount={this.props.rowCount}
        rowHeight={this.props.rowHeight}
        cellRenderer={this.renderRow}
        onScroll={this.onScroll}
        scrollToRow={scrollToRow}
        overscanRowCount={4}
        style={this.gridStyle}
        tabIndex={tabIndex}
      />
    )
  }

  /**
   * Renders a fake scroll container which sits on top of the
   * react-virtualized Grid component in order for us to be
   * able to have nice looking scrollbars on Windows.
   *
   * The fake scroll bar synchronizes its position
   *
   * NB: Should only be used on win32 platforms and needs to
   * be coupled with styling that hides scroll bars on Grid
   * and accurately positions the fake scroll bar.
   *
   * @param {height} - The height of the Grid as given by AutoSizer
   *
   */
  private renderFakeScroll(height: number) {

    let totalHeight: number = 0

    if (typeof this.props.rowHeight === 'number') {
      totalHeight = this.props.rowHeight * this.props.rowCount
    } else {
      for (let i = 0; i < this.props.rowCount; i++) {
        totalHeight += this.props.rowHeight({ index: i })
      }
    }

    return (
      <div
        key='fake-scroll'
        className='fake-scroll'
        ref={this.onFakeScrollRef}
        style={{ height }}
        onScroll={this.onFakeScroll}>
        <div style={{ height: totalHeight, pointerEvents: 'none' }}></div>
      </div>
    )
  }

  // Set the scroll position of the actual Grid to that
  // of the fake scroll bar. This is for mousewheel/touchpad
  // scrolling on top of the fake Grid or actual dragging of
  // the scroll thumb.
  private onFakeScroll = (e: React.UIEvent<HTMLDivElement>) => {

    // We're getting this event in reaction to the Grid
    // having been scrolled and subsequently updating the
    // fake scrollTop, ignore it
    if (this.lastScroll === 'grid') {
      this.lastScroll = null
      return
    }

    this.lastScroll = 'fake'

    if (this.grid) {

      const element = ReactDOM.findDOMNode(this.grid)
      if (element) {
        element.scrollTop = e.currentTarget.scrollTop
      }
    }
  }

  private handleMouseDown = (row: number, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row)) {
      if (row !== this.props.selectedRow && this.props.onSelectionChanged) {
        this.props.onSelectionChanged(row, { kind: 'mouseclick', event })
      }
    }
  }

  private onRowClick = (row: number, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row) && this.props.onRowClick) {
      this.props.onRowClick(row, { kind: 'mouseclick', event })
    }
  }

  private onScroll = ({ scrollTop, clientHeight }: { scrollTop: number, clientHeight: number }) => {
    if (this.props.onScroll) {
      this.props.onScroll(scrollTop, clientHeight)
    }

    // Set the scroll position of the fake scroll bar to that
    // of the actual Grid. This is for mousewheel/touchpad scrolling
    // on top of the Grid.
    if (__WIN32__ && this.fakeScroll) {

      // We're getting this event in reaction to the fake scroll
      // having been scrolled and subsequently updating the
      // Grid scrollTop, ignore it.
      if (this.lastScroll === 'fake') {
        this.lastScroll = null
        return
      }

      this.lastScroll = 'grid'

      this.fakeScroll.scrollTop = scrollTop
    }
  }

  /**
   * Explicitly put keyboard focus on the list or the selected item in the list.
   *
   * If the list a selected item it will be scrolled (if it's not already
   * visible) and it will receive keyboard focus. If the list has no selected
   * item the list itself will receive focus. From there keyboard navigation
   * can be used to select the first or last items in the list.
   *
   * This method is a noop if the list has not yet been mounted.
   */
  public focus() {
    if (this.props.selectedRow >= 0 && this.props.selectedRow < this.props.rowCount) {
      this.scrollRowToVisible(this.props.selectedRow)
    } else {
      if (this.grid) {
        const element = ReactDOM.findDOMNode(this.grid) as HTMLDivElement
        if (element) {
          element.focus()
        }
      }
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
