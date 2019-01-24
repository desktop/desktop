import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Grid, AutoSizer } from 'react-virtualized'
import { shallowEquals, arrayEquals } from '../../../lib/equality'
import { FocusContainer } from '../../lib/focus-container'
import { ListRow } from './list-row'
import {
  findNextSelectableRow,
  SelectionSource,
  SelectionDirection,
  IMouseClickSource,
  IKeyboardSource,
  ISelectAllSource,
} from './selection'
import { createUniqueId, releaseUniqueId } from '../../lib/id-pool'
import { range } from '../../../lib/range'

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

export type ClickSource = IMouseClickSource | IKeyboardSource

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
   * The currently selected rows indexes. Used to attach a special
   * selection class on those row's containers as well as being used
   * for keyboard selection.
   */
  readonly selectedRows: ReadonlyArray<number>

  /**
   * This function will be called when a pointer device is pressed and then
   * released on a selectable row. Note that this follows the conventions
   * of button elements such that pressing Enter or Space on a keyboard
   * while focused on a particular row will also trigger this event. Consumers
   * can differentiate between the two using the source parameter.
   *
   * Note that this event handler will not be called for keyboard events
   * if `event.preventDefault()` was called in the onRowKeyDown event handler.
   *
   * Consumers of this event do _not_ have to call event.preventDefault,
   * when this event is subscribed to the list will automatically call it.
   */
  readonly onRowClick?: (row: number, soure: ClickSource) => void

  /**
   * This prop defines the behaviour of the selection of items whithin this list.
   *  - 'single' : (default) single list-item selection. [shift] and [ctrl] have
   * no effect. Use in combination with one of:
   *             onSelectedRowChanged(row: number)
   *             onSelectionChanged(rows: number[])
   *  - 'range' : allows for selecting continuous ranges. [shift] can be used.
   * [ctrl] has no effect. Use in combination with one of:
   *             onSelectedRangeChanged(start: number, end: number)
   *             onSelectionChanged(rows: number[])
   *  - 'multi' : allows range and/or arbitrary selection. [shift] and [ctrl]
   * can be used. Use in combination with:
   *             onSelectionChanged(rows: number[])
   */
  readonly selectionMode?: 'single' | 'range' | 'multi'

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   * Use this function when the selectionMode is 'single'
   *
   * @param row    - The index of the row that was just selected
   * @param source - The kind of user action that provoked the change, either
   *                 a pointer device press, hover (if selectOnHover is set) or
   *                 a keyboard event (arrow up/down)
   */
  readonly onSelectedRowChanged?: (row: number, source: SelectionSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   * Index parameters are inclusive
   * Use this function when the selectionMode is 'range'
   *
   * @param start  - The index of the first selected row
   * @param end    - The index of the last selected row
   * @param source - The kind of user action that provoked the change, either
   *                 a pointer device press, hover (if selectOnHover is set) or
   *                 a keyboard event (arrow up/down)
   */
  readonly onSelectedRangeChanged?: (
    start: number,
    end: number,
    source: SelectionSource
  ) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   * Use this function for any selectionMode
   *
   * @param rows   - The indexes of the row(s) that are part of the selection
   * @param source - The kind of user action that provoked the change, either
   *                 a pointer device press, hover (if selectOnHover is set) or
   *                 a keyboard event (arrow up/down)
   */
  readonly onSelectionChanged?: (
    rows: ReadonlyArray<number>,
    source: SelectionSource
  ) => void

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
   * A handler called whenever a mouse down event is received on the
   * row container element. Unlike onSelectionChanged, this is raised
   * for every mouse down event, whether the row is selected or not.
   */
  readonly onRowMouseDown?: (row: number, event: React.MouseEvent<any>) => void

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

  readonly ariaMode?: 'list' | 'menu'

  /**
   * The number of pixels from the top of the list indicating
   * where to scroll do on rendering of the list.
   */
  readonly setScrollTop?: number
}

interface IListState {
  /** The available height for the list as determined by ResizeObserver */
  readonly height?: number

  /** The available width for the list as determined by ResizeObserver */
  readonly width?: number

  readonly rowIdPrefix?: string
}

/**
 * Create an array with row indices between firstRow and lastRow (inclusive).
 *
 * This is essentially a range function with the explicit behavior of
 * inclusive upper and lower bound.
 */
function createSelectionBetween(
  firstRow: number,
  lastRow: number
): ReadonlyArray<number> {
  // range is upper bound exclusive
  const end = lastRow > firstRow ? lastRow + 1 : lastRow - 1
  return range(firstRow, end)
}

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
  private grid: React.Component<any, any> | null = null
  private readonly resizeObserver: ResizeObserver | null = null
  private updateSizeTimeoutId: number | null = null

  public constructor(props: IListProps) {
    super(props)

    // If we have a selected row when we're about to mount
    // we'll scroll to it immediately.
    if (props.selectedRows.length > 0) {
      this.scrollToRow = props.selectedRows[0]
    }

    this.state = {}

    const ResizeObserverClass: typeof ResizeObserver = (window as any)
      .ResizeObserver

    if (ResizeObserver || false) {
      this.resizeObserver = new ResizeObserverClass(entries => {
        for (const entry of entries) {
          if (entry.target === this.list) {
            // We might end up causing a recursive update by updating the state
            // when we're reacting to a resize so we'll defer it until after
            // react is done with this frame.
            if (this.updateSizeTimeoutId !== null) {
              clearImmediate(this.updateSizeTimeoutId)
            }

            this.updateSizeTimeoutId = setImmediate(
              this.onResized,
              entry.target,
              entry.contentRect
            )
          }
        }
      })
    }
  }

  private onResized = (target: HTMLElement, contentRect: ClientRect) => {
    this.updateSizeTimeoutId = null

    const [width, height] = [target.offsetWidth, target.offsetHeight]

    if (this.state.width !== width || this.state.height !== height) {
      this.setState({ width, height })
    }
  }

  private onSelectAll = (event: Event) => {
    const selectionMode = this.props.selectionMode

    if (selectionMode !== 'range' && selectionMode !== 'multi') {
      return
    }

    event.preventDefault()

    if (this.props.rowCount <= 0) {
      return
    }

    const source: ISelectAllSource = { kind: 'select-all' }
    const firstRow = 0
    const lastRow = this.props.rowCount - 1

    if (this.props.onSelectionChanged) {
      const newSelection = createSelectionBetween(firstRow, lastRow)
      this.props.onSelectionChanged(newSelection, source)
    }

    if (selectionMode === 'range' && this.props.onSelectedRangeChanged) {
      this.props.onSelectedRangeChanged(firstRow, lastRow, source)
    }
  }

  private onRef = (element: HTMLDivElement | null) => {
    if (element === null && this.list !== null) {
      this.list.removeEventListener('select-all', this.onSelectAll)
    }

    this.list = element

    if (element !== null) {
      // This is a custom event that desktop emits through <App />
      // when the user selects the Edit > Select all menu item. We
      // hijack it and select all list items rather than let it bubble
      // to electron's default behavior which is to select all selectable
      // text in the renderer.
      element.addEventListener('select-all', this.onSelectAll)
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()

      if (element !== null) {
        this.resizeObserver.observe(element)
      } else {
        this.setState({ width: undefined, height: undefined })
      }
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<any>) => {
    this.props.selectedRows.forEach(row => {
      if (this.props.onRowKeyDown) {
        this.props.onRowKeyDown(row, event)
      }
    })

    // The consumer is given a change to prevent the default behavior for
    // keyboard navigation so that they can customize its behavior as needed.
    if (event.defaultPrevented) {
      return
    }

    if (event.key === 'ArrowDown') {
      if (
        event.shiftKey &&
        this.props.selectionMode &&
        this.props.selectionMode !== 'single'
      ) {
        this.addSelection('down', event)
      } else {
        this.moveSelection('down', event)
      }
      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (
        event.shiftKey &&
        this.props.selectionMode &&
        this.props.selectionMode !== 'single'
      ) {
        this.addSelection('up', event)
      } else {
        this.moveSelection('up', event)
      }
      event.preventDefault()
    }
  }

  private onRowKeyDown = (
    rowIndex: number,
    event: React.KeyboardEvent<any>
  ) => {
    if (this.props.onRowKeyDown) {
      this.props.onRowKeyDown(rowIndex, event)
    }

    // We give consumers the power to prevent the onRowClick event by subscribing
    // to the onRowKeyDown event and calling event.preventDefault. This lets
    // consumers add their own semantics for keyboard presses.
    if (
      !event.defaultPrevented &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      this.toggleSelection(event)
      event.preventDefault()
    }
  }

  private onFocusContainerKeyDown = (event: React.KeyboardEvent<any>) => {
    if (
      !event.defaultPrevented &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      this.toggleSelection(event)
      event.preventDefault()
    }
  }

  private toggleSelection = (event: React.KeyboardEvent<any>) => {
    this.props.selectedRows.forEach(row => {
      if (!this.props.onRowClick) {
        return
      }

      const { rowCount } = this.props

      if (row < 0 || row >= rowCount) {
        log.debug(
          `[List.toggleSelection] unable to onRowClick for row ${row} as it is outside the bounds of the array [0, ${rowCount}]`
        )
        return
      }

      this.props.onRowClick(row, { kind: 'keyboard', event })
    })
  }

  private onRowMouseOver = (row: number, event: React.MouseEvent<any>) => {
    if (this.props.selectOnHover && this.canSelectRow(row)) {
      if (
        this.props.selectedRows.includes(row) &&
        this.props.onSelectionChanged
      ) {
        this.props.onSelectionChanged([row], { kind: 'hover', event })
        // By calling scrollRowToVisible we ensure that hovering over a partially
        // visible item at the top or bottom of the list scrolls it into view but
        // more importantly `scrollRowToVisible` automatically manages focus so
        // using it here allows us to piggy-back on its focus-preserving magic
        // even though we could theoretically live without scrolling
        this.scrollRowToVisible(row)
      }
    }
  }

  /** Convenience method for invoking canSelectRow callback when it exists */
  private canSelectRow = (rowIndex: number) => {
    return this.props.canSelectRow ? this.props.canSelectRow(rowIndex) : true
  }

  private addSelection(
    direction: SelectionDirection,
    event: React.KeyboardEvent<any>
  ) {
    if (this.props.selectedRows.length === 0) {
      return this.moveSelection(direction, event)
    }

    const lastSelection = this.props.selectedRows[
      this.props.selectedRows.length - 1
    ]

    const selectionOrigin = this.props.selectedRows[0]

    const newRow = findNextSelectableRow(
      this.props.rowCount,
      { direction, row: lastSelection, wrap: false },
      this.canSelectRow
    )

    if (newRow != null) {
      if (this.props.onSelectionChanged) {
        const newSelection = createSelectionBetween(selectionOrigin, newRow)
        this.props.onSelectionChanged(newSelection, { kind: 'keyboard', event })
      }

      if (
        this.props.selectionMode === 'range' &&
        this.props.onSelectedRangeChanged
      ) {
        this.props.onSelectedRangeChanged(selectionOrigin, newRow, {
          kind: 'keyboard',
          event,
        })
      }

      this.scrollRowToVisible(newRow)
    }
  }

  private moveSelection(
    direction: SelectionDirection,
    event: React.KeyboardEvent<any>
  ) {
    const lastSelection =
      this.props.selectedRows.length > 0
        ? this.props.selectedRows[this.props.selectedRows.length - 1]
        : -1

    const newRow = findNextSelectableRow(
      this.props.rowCount,
      { direction, row: lastSelection },
      this.canSelectRow
    )

    if (newRow != null) {
      if (this.props.onSelectionChanged) {
        this.props.onSelectionChanged([newRow], { kind: 'keyboard', event })
      }

      if (this.props.onSelectedRowChanged) {
        const rowCount = this.props.rowCount

        if (newRow < 0 || newRow >= rowCount) {
          log.debug(
            `[List.moveSelection] unable to onSelectedRowChanged for row '${newRow}' as it is outside the bounds of the array [0, ${rowCount}]`
          )
          return
        }

        this.props.onSelectedRowChanged(newRow, {
          kind: 'keyboard',
          event,
        })
      }

      this.scrollRowToVisible(newRow)
    }
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
        const selectedRowChanged = !arrayEquals(
          prevProps.selectedRows,
          this.props.selectedRows
        )

        const invalidationPropsChanged = !shallowEquals(
          prevProps.invalidationProps,
          this.props.invalidationProps
        )

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

  public componentWillMount() {
    this.setState({ rowIdPrefix: createUniqueId('ListRow') })
  }

  public componentWillUnmount() {
    if (this.updateSizeTimeoutId !== null) {
      clearImmediate(this.updateSizeTimeoutId)
      this.updateSizeTimeoutId = null
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }

    if (this.state.rowIdPrefix) {
      releaseUniqueId(this.state.rowIdPrefix)
    }
  }

  private onFocusedItemRef = (element: HTMLDivElement | null) => {
    this.focusItem = element
  }

  private renderRow = (params: IRowRendererParams) => {
    const rowIndex = params.rowIndex
    const selectable = this.canSelectRow(rowIndex)
    const selected = this.props.selectedRows.indexOf(rowIndex) !== -1
    const focused = rowIndex === this.focusRow

    // An unselectable row shouldn't be focusable
    let tabIndex: number | undefined = undefined
    if (selectable) {
      tabIndex = selected && this.props.selectedRows[0] === rowIndex ? 0 : -1
    }

    // We only need to keep a reference to the focused element
    const ref = focused ? this.onFocusedItemRef : undefined

    const element = this.props.rowRenderer(params.rowIndex)

    const id = this.state.rowIdPrefix
      ? `${this.state.rowIdPrefix}-${rowIndex}`
      : undefined

    return (
      <ListRow
        key={params.key}
        id={id}
        onRef={ref}
        rowCount={this.props.rowCount}
        rowIndex={rowIndex}
        selected={selected}
        ariaMode={this.props.ariaMode}
        onRowClick={this.onRowClick}
        onRowKeyDown={this.onRowKeyDown}
        onRowMouseDown={this.onRowMouseDown}
        onRowMouseOver={this.onRowMouseOver}
        style={params.style}
        tabIndex={tabIndex}
        children={element}
        selectable={selectable}
      />
    )
  }

  public render() {
    let content: JSX.Element[] | JSX.Element | null

    if (this.resizeObserver) {
      content =
        this.state.width && this.state.height
          ? this.renderContents(this.state.width, this.state.height)
          : null
    } else {
      // Legacy in the event that we don't have ResizeObserver
      content = (
        <AutoSizer disableWidth={true} disableHeight={true}>
          {({ width, height }: { width: number; height: number }) =>
            this.renderContents(width, height)
          }
        </AutoSizer>
      )
    }

    // we select the last item from the selection array for this prop
    const activeDescendant =
      this.props.selectedRows.length && this.state.rowIdPrefix
        ? `${this.state.rowIdPrefix}-${
            this.props.selectedRows[this.props.selectedRows.length - 1]
          }`
        : undefined

    const role = this.props.ariaMode === 'menu' ? 'menu' : 'listbox'

    return (
      <div
        ref={this.onRef}
        id={this.props.id}
        className="list"
        onKeyDown={this.onKeyDown}
        role={role}
        aria-activedescendant={activeDescendant}
      >
        {content}
      </div>
    )
  }

  /**
   * Renders the react-virtualized Grid component and optionally
   * a fake scroll bar component if running on Windows.
   *
   * @param width - The width of the Grid as given by AutoSizer
   * @param height - The height of the Grid as given by AutoSizer
   *
   */
  private renderContents(width: number, height: number) {
    if (__WIN32__) {
      return (
        <>
          {this.renderGrid(width, height)}
          {this.renderFakeScroll(height)}
        </>
      )
    }

    return this.renderGrid(width, height)
  }

  private onGridRef = (ref: React.Component<any, any> | null) => {
    this.grid = ref
  }

  private onFakeScrollRef = (ref: HTMLDivElement | null) => {
    this.fakeScroll = ref
  }

  /**
   * Renders the react-virtualized Grid component
   *
   * @param width - The width of the Grid as given by AutoSizer
   * @param height - The height of the Grid as given by AutoSizer
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
    const tabIndex =
      this.props.selectedRows.length < 1 && this.props.rowCount > 0 ? 0 : -1

    return (
      <FocusContainer
        className="list-focus-container"
        onKeyDown={this.onFocusContainerKeyDown}
      >
        <Grid
          aria-label={''}
          role={''}
          ref={this.onGridRef}
          autoContainerWidth={true}
          width={width}
          height={height}
          columnWidth={width}
          columnCount={1}
          rowCount={this.props.rowCount}
          rowHeight={this.props.rowHeight}
          cellRenderer={this.renderRow}
          onScroll={this.onScroll}
          scrollToRow={scrollToRow}
          scrollTop={this.props.setScrollTop}
          overscanRowCount={4}
          style={this.gridStyle}
          tabIndex={tabIndex}
        />
      </FocusContainer>
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
   * @param height The height of the Grid as given by AutoSizer
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
        className="fake-scroll"
        ref={this.onFakeScrollRef}
        style={{ height }}
        onScroll={this.onFakeScroll}
      >
        <div style={{ height: totalHeight, pointerEvents: 'none' }} />
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
      if (element instanceof Element) {
        element.scrollTop = e.currentTarget.scrollTop
      }
    }
  }

  private onRowMouseDown = (row: number, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row)) {
      if (this.props.onRowMouseDown) {
        this.props.onRowMouseDown(row, event)
      }

      // macOS allow emulating a right click by holding down the ctrl key while
      // performing a "normal" click.
      const isRightClick =
        event.button === 2 ||
        (__DARWIN__ && event.button === 0 && event.ctrlKey)

      // prevent the right-click event from changing the selection if not necessary
      if (isRightClick && this.props.selectedRows.includes(row)) {
        return
      }

      const multiSelectKey = __DARWIN__ ? event.metaKey : event.ctrlKey

      if (
        event.shiftKey &&
        this.props.selectedRows.length &&
        this.props.selectionMode &&
        this.props.selectionMode !== 'single'
      ) {
        /*
         * if [shift] is pressed and selectionMode is different than 'single',
         * select all in-between first selection and current row
         */
        const selectionOrigin = this.props.selectedRows[0]

        if (this.props.onSelectionChanged) {
          const newSelection = createSelectionBetween(selectionOrigin, row)
          this.props.onSelectionChanged(newSelection, {
            kind: 'mouseclick',
            event,
          })
        }
        if (
          this.props.selectionMode === 'range' &&
          this.props.onSelectedRangeChanged
        ) {
          this.props.onSelectedRangeChanged(selectionOrigin, row, {
            kind: 'mouseclick',
            event,
          })
        }
      } else if (multiSelectKey && this.props.selectionMode === 'multi') {
        /*
         * if [ctrl] is pressed and selectionMode is 'multi',
         * toggle selection of the targeted row
         */
        if (this.props.onSelectionChanged) {
          let newSelection: ReadonlyArray<number>
          if (this.props.selectedRows.includes(row)) {
            // remove the ability to deselect the last item
            if (this.props.selectedRows.length === 1) {
              return
            }
            newSelection = this.props.selectedRows.filter(ix => ix !== row)
          } else {
            newSelection = [...this.props.selectedRows, row]
          }

          this.props.onSelectionChanged(newSelection, {
            kind: 'mouseclick',
            event,
          })
        }
      } else if (
        this.props.selectedRows.length !== 1 ||
        (this.props.selectedRows.length === 1 &&
          row !== this.props.selectedRows[0])
      ) {
        /*
         * if no special key is pressed, and that the selection is different,
         * single selection occurs
         */
        if (this.props.onSelectionChanged) {
          this.props.onSelectionChanged([row], { kind: 'mouseclick', event })
        }

        if (this.props.onSelectedRangeChanged) {
          this.props.onSelectedRangeChanged(row, row, {
            kind: 'mouseclick',
            event,
          })
        }

        if (this.props.onSelectedRowChanged) {
          const { rowCount } = this.props

          if (row < 0 || row >= rowCount) {
            log.debug(
              `[List.onRowMouseDown] unable to onSelectedRowChanged for row '${row}' as it is outside the bounds of the array [0, ${rowCount}]`
            )
            return
          }

          this.props.onSelectedRowChanged(row, { kind: 'mouseclick', event })
        }
      }
    }
  }

  private onRowClick = (row: number, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row) && this.props.onRowClick) {
      const rowCount = this.props.rowCount

      if (row < 0 || row >= rowCount) {
        log.debug(
          `[List.onRowClick] unable to onRowClick for row ${row} as it is outside the bounds of the array [0, ${rowCount}]`
        )
        return
      }

      this.props.onRowClick(row, { kind: 'mouseclick', event })
    }
  }

  private onScroll = ({
    scrollTop,
    clientHeight,
  }: {
    scrollTop: number
    clientHeight: number
  }) => {
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
    if (
      this.props.selectedRows.length > 0 &&
      this.props.selectedRows[this.props.selectedRows.length - 1] <
        this.props.rowCount
    ) {
      this.scrollRowToVisible(
        this.props.selectedRows[this.props.selectedRows.length - 1]
      )
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
