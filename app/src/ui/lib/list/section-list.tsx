import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { Grid, AutoSizer, Index } from 'react-virtualized'
import { shallowEquals, structuralEquals } from '../../../lib/equality'
import { FocusContainer } from '../../lib/focus-container'
import { ListRow } from './list-row'
import {
  findNextSelectableRow,
  SelectionSource,
  SelectionDirection,
  IMouseClickSource,
  IKeyboardSource,
  ISelectAllSource,
  findLastSelectableRow,
} from './section-list-selection'
import { createUniqueId, releaseUniqueId } from '../../lib/id-pool'
import {
  InsertionFeedbackType,
  ListItemInsertionOverlay,
} from './list-item-insertion-overlay'
import { DragData, DragType } from '../../../models/drag-drop'
import memoizeOne from 'memoize-one'
import {
  getTotalRowCount,
  globalIndexToRowIndexPath,
  InvalidRowIndexPath,
  isValidRow,
  RowIndexPath,
  rowIndexPathEquals,
  rowIndexPathToGlobalIndex,
} from './list-row-index-path'
import { range } from '../../../lib/range'
import { sendNonFatalException } from '../../../lib/helpers/non-fatal-exception'

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

interface ISectionListProps {
  /**
   * Mandatory callback for rendering the contents of a particular
   * row. The callback is not responsible for the outer wrapper
   * of the row, only its contents and may return null although
   * that will result in an empty list item.
   */
  readonly rowRenderer: (indexPath: RowIndexPath) => JSX.Element | null

  /**
   * Whether or not a given section has a header row at the beginning. When
   * ommitted, it's assumed the section does NOT have a header row.
   */
  readonly sectionHasHeader?: (section: number) => boolean

  /**
   * The total number of rows in the list. This is used for
   * scroll virtualization purposes when calculating the theoretical
   * height of the list.
   */
  readonly rowCount: ReadonlyArray<number>

  /**
   * The height of each individual row in the list. This height
   * is enforced for each row container and attempting to render a row
   * which does not fit inside that height is forbidden.
   *
   * Can either be a number (most efficient) in which case all rows
   * are of equal height, or, a function that, given a row index returns
   * the height of that particular row.
   */
  readonly rowHeight: number | ((info: { index: RowIndexPath }) => number)

  /**
   * Function that generates an ID for a given row. This will allow the
   * container component of the list to have control over the ID of the
   * row and allow it to be used for things like keyboard navigation.
   */
  readonly rowId?: (indexPath: RowIndexPath) => string

  /**
   * The currently selected rows indexes. Used to attach a special
   * selection class on those row's containers as well as being used
   * for keyboard selection.
   *
   * It is expected that the use case for this is setting of the initially
   * selected rows or clearing a list selection.
   *
   * N.B. Since it is used for keyboard selection, changing the ordering of
   * elements in this array in a parent component may result in unexpected
   * behaviors when a user modifies their selection via key commands.
   * See #15536 lessons learned.
   */
  readonly selectedRows: ReadonlyArray<RowIndexPath>

  /**
   * Used to attach special classes to specific rows
   */
  readonly rowCustomClassNameMap?: Map<string, ReadonlyArray<RowIndexPath>>

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
  readonly onRowClick?: (row: RowIndexPath, source: ClickSource) => void

  readonly onRowDoubleClick?: (
    indexPath: RowIndexPath,
    source: IMouseClickSource
  ) => void

  /** This function will be called when a row obtains focus, no matter how */
  readonly onRowFocus?: (
    indexPath: RowIndexPath,
    source: React.FocusEvent<HTMLDivElement>
  ) => void

  /** This function will be called only when a row obtains focus via keyboard */
  readonly onRowKeyboardFocus?: (
    indexPath: RowIndexPath,
    e: React.KeyboardEvent<any>
  ) => void

  /** This function will be called when a row loses focus */
  readonly onRowBlur?: (
    indexPath: RowIndexPath,
    source: React.FocusEvent<HTMLDivElement>
  ) => void

  /**
   * This prop defines the behaviour of the selection of items within this list.
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
   *                 a pointer device press or a keyboard event (arrow up/down)
   */
  readonly onSelectedRowChanged?: (
    indexPath: RowIndexPath,
    source: SelectionSource
  ) => void

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
   *                 a pointer device press or a keyboard event (arrow up/down)
   */
  readonly onSelectedRangeChanged?: (
    start: RowIndexPath,
    end: RowIndexPath,
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
   *                 a pointer device press or a keyboard event (arrow up/down)
   */
  readonly onSelectionChanged?: (
    rows: ReadonlyArray<RowIndexPath>,
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
  readonly onRowKeyDown?: (
    indexPath: RowIndexPath,
    event: React.KeyboardEvent<any>
  ) => void

  /**
   * A handler called whenever a mouse down event is received on the
   * row container element. Unlike onSelectionChanged, this is raised
   * for every mouse down event, whether the row is selected or not.
   */
  readonly onRowMouseDown?: (
    indexPath: RowIndexPath,
    event: React.MouseEvent<any>
  ) => void

  /**
   * A handler called whenever a context menu event is received on the
   * row container element.
   *
   * The context menu is invoked when a user right clicks the row or
   * uses keyboard shortcut.
   */
  readonly onRowContextMenu?: (
    row: RowIndexPath,
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  /**
   * A handler called whenever the user drops items on the list to be inserted.
   *
   * @param row - The index of the row where the user intends to insert the new
   *              items.
   * @param data -  The data dropped by the user.
   */
  readonly onDropDataInsertion?: (
    indexPath: RowIndexPath,
    data: DragData
  ) => void

  /**
   * An optional handler called to determine whether a given row is
   * selectable or not. Reasons for why a row might not be selectable
   * includes it being a group header or the item being disabled.
   */
  readonly canSelectRow?: (row: RowIndexPath) => boolean
  readonly onScroll?: (scrollTop: number, clientHeight: number) => void

  /**
   * List's underlying implementation acts as a pure component based on the
   * above props. So if there are any other properties that also determine
   * whether the list should re-render, List must know about them.
   */
  readonly invalidationProps?: any

  /** The unique identifier for the outer element of the component (optional, defaults to null) */
  readonly id?: string

  /** The unique identifier of the accessible list component (optional) */
  readonly accessibleListId?: string

  /** The row that should be scrolled to when the list is rendered. */
  readonly scrollToRow?: RowIndexPath

  /** Type of elements that can be inserted in the list via drag & drop. Optional. */
  readonly insertionDragType?: DragType

  /**
   * The number of pixels from the top of the list indicating
   * where to scroll do on rendering of the list.
   */
  readonly setScrollTop?: number

  /** The aria-labelledby attribute for the list component. */
  readonly ariaLabelledBy?: string

  /** The aria-label attribute for the list component. */
  readonly ariaLabel?: string

  /**
   * Optional callback for providing an aria label for screen readers for each
   * row.
   *
   * Note: you may need to apply an aria-hidden attribute to any child text
   * elements for this to take precedence.
   */
  readonly getRowAriaLabel?: (indexPath: RowIndexPath) => string | undefined
}

interface ISectionListState {
  /** The available height for the list as determined by ResizeObserver */
  readonly height?: number

  /** The available width for the list as determined by ResizeObserver */
  readonly width?: number

  readonly rowIdPrefix?: string

  readonly scrollTop: number
}

/**
 * Create an array with row indices between firstRow and lastRow (inclusive).
 *
 * This is essentially a range function with the explicit behavior of
 * inclusive upper and lower bound.
 */
function createSelectionBetween(
  firstRow: RowIndexPath,
  lastRow: RowIndexPath,
  rowCount: ReadonlyArray<number>
): ReadonlyArray<RowIndexPath> {
  const firstIndex = rowIndexPathToGlobalIndex(firstRow, rowCount)
  const lastIndex = rowIndexPathToGlobalIndex(lastRow, rowCount)
  if (firstIndex === null || lastIndex === null) {
    return []
  }

  const end = lastIndex > firstIndex ? lastIndex + 1 : lastIndex - 1
  // range is upper bound exclusive
  const rowRange = range(firstIndex, end)
  const selection = new Array<RowIndexPath>(rowRange.length)
  for (let i = 0; i < rowRange.length; i++) {
    const indexPath = globalIndexToRowIndexPath(rowRange[i], rowCount)
    if (indexPath !== null) {
      selection[i] = indexPath
    }
  }
  return selection
}

// Since objects cannot be keys in a Map, this class encapsulates the logic for
// creating a string key from a RowIndexPath.
class RowRefsMap {
  private readonly map = new Map<string, HTMLDivElement>()

  private getIndexPathKey(indexPath: RowIndexPath): string {
    return `${indexPath.section}-${indexPath.row}`
  }

  public get(indexPath: RowIndexPath): HTMLDivElement | undefined {
    return this.map.get(this.getIndexPathKey(indexPath))
  }

  public set(indexPath: RowIndexPath, element: HTMLDivElement) {
    this.map.set(this.getIndexPathKey(indexPath), element)
  }

  public delete(indexPath: RowIndexPath) {
    this.map.delete(this.getIndexPathKey(indexPath))
  }
}

export class SectionList extends React.Component<
  ISectionListProps,
  ISectionListState
> {
  private fakeScroll: HTMLDivElement | null = null
  private focusRow: RowIndexPath = InvalidRowIndexPath

  private readonly rowRefs = new RowRefsMap()

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
  private rootGrid: Grid | null = null
  private grids = new Map<number, Grid>()
  private readonly resizeObserver: ResizeObserver | null = null
  private updateSizeTimeoutId: NodeJS.Immediate | null = null

  /**
   * Get the props for the inner scroll container (called containerProps on the
   * Grid component). This is memoized to avoid causing the Grid component to
   * rerender every time the list component rerenders (the Grid component is a
   * pure component so a complex object like containerProps being instantiated
   * on each render would cause it to rerender constantly).
   */
  private getContainerProps = memoizeOne(
    (
      activeDescendant: string | undefined
    ): React.HTMLProps<HTMLDivElement> => ({
      onKeyDown: this.onKeyDown,
      'aria-activedescendant': activeDescendant,
      'aria-multiselectable':
        this.props.selectionMode === 'multi' ||
        this.props.selectionMode === 'range'
          ? 'true'
          : undefined,
    })
  )

  public constructor(props: ISectionListProps) {
    super(props)

    this.state = {
      scrollTop: 0,
    }

    const ResizeObserverClass: typeof ResizeObserver = (window as any)
      .ResizeObserver

    if (ResizeObserver || false) {
      this.resizeObserver = new ResizeObserverClass(entries => {
        for (const { target, contentRect } of entries) {
          if (target === this.list && this.list !== null) {
            // We might end up causing a recursive update by updating the state
            // when we're reacting to a resize so we'll defer it until after
            // react is done with this frame.
            if (this.updateSizeTimeoutId !== null) {
              clearImmediate(this.updateSizeTimeoutId)
            }

            this.updateSizeTimeoutId = setImmediate(
              this.onResized,
              this.list,
              contentRect
            )
          }
        }
      })
    }
  }

  private get totalRowCount() {
    return getTotalRowCount(this.props.rowCount)
  }

  private getRowId(indexPath: RowIndexPath): string | undefined {
    if (this.props.rowId) {
      return this.props.rowId(indexPath)
    }

    return this.state.rowIdPrefix === undefined
      ? undefined
      : `${this.state.rowIdPrefix}-${indexPath.section}-${indexPath.row}`
  }

  private onResized = (target: HTMLElement, contentRect: ClientRect) => {
    this.updateSizeTimeoutId = null

    const [width, height] = [target.offsetWidth, target.offsetHeight]

    if (this.state.width !== width || this.state.height !== height) {
      this.setState({ width, height })
    }
  }

  private onSelectAll = (event: Event | React.SyntheticEvent<any>) => {
    const selectionMode = this.props.selectionMode

    if (selectionMode !== 'range' && selectionMode !== 'multi') {
      return
    }

    event.preventDefault()

    if (this.totalRowCount <= 0) {
      return
    }

    const source: ISelectAllSource = { kind: 'select-all' }
    const firstRow: RowIndexPath = { section: 0, row: 0 }
    const lastRow: RowIndexPath = {
      section: this.props.rowCount.length - 1,
      row: this.props.rowCount[this.props.rowCount.length - 1] - 1,
    }

    if (this.props.onSelectionChanged) {
      const newSelection = createSelectionBetween(
        firstRow,
        lastRow,
        this.props.rowCount
      )
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
    if (this.props.onRowKeyDown) {
      for (const row of this.props.selectedRows) {
        this.props.onRowKeyDown(row, event)
      }
    }

    // The consumer is given a change to prevent the default behavior for
    // keyboard navigation so that they can customize its behavior as needed.
    if (event.defaultPrevented) {
      return
    }

    const source: SelectionSource = { kind: 'keyboard', event }

    // Home is Cmd+ArrowUp on macOS, end is Cmd+ArrowDown, see
    // https://github.com/desktop/desktop/pull/8644#issuecomment-645965884
    const isHomeKey = __DARWIN__
      ? event.metaKey && event.key === 'ArrowUp'
      : event.key === 'Home'
    const isEndKey = __DARWIN__
      ? event.metaKey && event.key === 'ArrowDown'
      : event.key === 'End'

    const isRangeSelection =
      event.shiftKey &&
      this.props.selectionMode !== undefined &&
      this.props.selectionMode !== 'single'

    if (isHomeKey || isEndKey) {
      const direction = isHomeKey ? 'up' : 'down'
      if (isRangeSelection) {
        this.addSelectionToLastSelectableRow(direction, source)
      } else {
        this.moveSelectionToLastSelectableRow(direction, source)
      }
      event.preventDefault()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      const direction = event.key === 'ArrowUp' ? 'up' : 'down'
      if (isRangeSelection) {
        this.addSelection(direction, source)
      } else {
        this.moveSelection(direction, source)
      }
      event.preventDefault()
    } else if (!__DARWIN__ && event.key === 'a' && event.ctrlKey) {
      // On Windows Chromium will steal the Ctrl+A shortcut before
      // Electron gets its hands on it meaning that the Select all
      // menu item can't be invoked by means of keyboard shortcuts
      // on Windows. Clicking on the menu item still emits the
      // 'select-all' custom DOM event.
      this.onSelectAll(event)
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      const direction = event.key === 'PageUp' ? 'up' : 'down'
      if (isRangeSelection) {
        this.addSelectionByPage(direction, source)
      } else {
        this.moveSelectionByPage(direction, source)
      }
      event.preventDefault()
    }
  }

  private moveSelectionByPage(
    direction: SelectionDirection,
    source: SelectionSource
  ) {
    const newSelection = this.getNextPageRowIndexPath(direction)
    this.moveSelectionTo(newSelection, source)
  }

  private addSelectionByPage(
    direction: SelectionDirection,
    source: SelectionSource
  ) {
    const { selectedRows } = this.props
    const newSelection = this.getNextPageRowIndexPath(direction)
    const firstSelection = selectedRows[0] ?? 0
    const range = createSelectionBetween(
      firstSelection,
      newSelection,
      this.props.rowCount
    )

    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged(range, source)
    }

    if (this.props.onSelectedRangeChanged) {
      this.props.onSelectedRangeChanged(
        range[0],
        range[range.length - 1],
        source
      )
    }

    this.scrollRowToVisible(newSelection)
  }

  private getNextPageRowIndexPath(direction: SelectionDirection) {
    const { selectedRows } = this.props
    const lastSelection: RowIndexPath = selectedRows.at(-1) ?? {
      row: 0,
      section: 0,
    }

    return this.findNextPageSelectableRow(lastSelection, direction)
  }

  private getHeightForRowAtIndexPath(index: RowIndexPath) {
    const { rowHeight } = this.props
    return typeof rowHeight === 'number' ? rowHeight : rowHeight({ index })
  }

  private findNextPageSelectableRow(
    fromRow: RowIndexPath,
    direction: SelectionDirection
  ) {
    const { height: listHeight } = this.state
    const { rowCount } = this.props

    if (listHeight === undefined) {
      return fromRow
    }

    let offset = 0
    let newSelection = fromRow
    const delta = direction === 'up' ? -1 : 1

    // Starting from the last selected row, move up or down depending
    // on the direction, keeping a sum of the height of all the rows
    // we've seen until the accumulated height is about to exceed that
    // of the list height. Once we've found the index of the item that
    // just about exceeds the height we'll pick that one as the next
    // selection.
    for (let i = fromRow.section; i < rowCount.length && i >= 0; i += delta) {
      const initialRow = i === fromRow.section ? fromRow.row : 0

      for (let j = initialRow; j < rowCount[i] && j >= 0; j += delta) {
        const indexPath = { section: i, row: j }
        const h = this.getHeightForRowAtIndexPath(indexPath)

        if (offset + h > listHeight) {
          break
        }
        offset += h

        if (this.canSelectRow(indexPath)) {
          newSelection = indexPath
        }
      }
    }

    return newSelection
  }

  private onRowKeyDown = (
    rowIndex: RowIndexPath,
    event: React.KeyboardEvent<any>
  ) => {
    if (this.props.onRowKeyDown) {
      this.props.onRowKeyDown(rowIndex, event)
    }

    const hasModifier =
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey

    // We give consumers the power to prevent the onRowClick event by subscribing
    // to the onRowKeyDown event and calling event.preventDefault. This lets
    // consumers add their own semantics for keyboard presses.
    if (
      !event.defaultPrevented &&
      !hasModifier &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      this.toggleSelection(event)
      event.preventDefault()
    }
  }

  private onFocusContainerKeyDown = (event: React.KeyboardEvent<any>) => {
    const hasModifier =
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey

    if (
      !event.defaultPrevented &&
      !hasModifier &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      this.toggleSelection(event)
      event.preventDefault()
    }
  }

  private onFocusWithinChanged = (focusWithin: boolean) => {
    // So the grid lost focus (we manually focus the grid if the focused list
    // item is unmounted) so we mustn't attempt to refocus the previously
    // focused list item if it scrolls back into view.
    if (!focusWithin) {
      this.focusRow = InvalidRowIndexPath
    } else if (this.props.selectedRows.length === 0) {
      const firstSelectableRowIndexPath = this.getFirstSelectableRowIndexPath()
      if (firstSelectableRowIndexPath !== null) {
        this.moveSelectionTo(firstSelectableRowIndexPath, { kind: 'focus' })
      }
    }
  }

  private toggleSelection = (event: React.KeyboardEvent<any>) => {
    this.props.selectedRows.forEach(row => {
      if (!this.props.onRowClick) {
        return
      }

      if (!isValidRow(row, this.props.rowCount)) {
        log.debug(
          `[List.toggleSelection] unable to onRowClick for row ${row} as it is outside the bounds`
        )
        return
      }

      this.props.onRowClick(row, { kind: 'keyboard', event })
    })
  }

  private onRowFocus = (
    index: RowIndexPath,
    e: React.FocusEvent<HTMLDivElement>
  ) => {
    this.focusRow = index
    this.props.onRowFocus?.(index, e)
  }

  private onRowKeyboardFocus = (
    index: RowIndexPath,
    e: React.KeyboardEvent<HTMLDivElement>
  ) => {
    this.props.onRowKeyboardFocus?.(index, e)
  }

  private onRowBlur = (
    index: RowIndexPath,
    e: React.FocusEvent<HTMLDivElement>
  ) => {
    if (rowIndexPathEquals(this.focusRow, index)) {
      this.focusRow = InvalidRowIndexPath
    }
    this.props.onRowBlur?.(index, e)
  }

  private onRowContextMenu = (
    row: RowIndexPath,
    e: React.MouseEvent<HTMLDivElement>
  ) => {
    this.props.onRowContextMenu?.(row, e)
  }

  private get firstRowIndexPath(): RowIndexPath {
    for (let section = 0; section < this.props.rowCount.length; section++) {
      const rowCount = this.props.rowCount[section]
      if (rowCount > 0) {
        return { section, row: 0 }
      }
    }

    return InvalidRowIndexPath
  }

  /** Convenience method for invoking canSelectRow callback when it exists */
  private canSelectRow = (rowIndex: RowIndexPath) => {
    return this.props.canSelectRow ? this.props.canSelectRow(rowIndex) : true
  }

  private getFirstSelectableRowIndexPath(): RowIndexPath | null {
    const { rowCount } = this.props

    for (let section = 0; section < rowCount.length; section++) {
      const rowCountInSection = rowCount[section]
      for (let row = 0; row < rowCountInSection; row++) {
        const indexPath = { section, row }
        if (this.canSelectRow(indexPath)) {
          return indexPath
        }
      }
    }

    return null
  }

  private addSelection(direction: SelectionDirection, source: SelectionSource) {
    if (this.props.selectedRows.length === 0) {
      return this.moveSelection(direction, source)
    }

    const lastSelection =
      this.props.selectedRows[this.props.selectedRows.length - 1]

    const selectionOrigin = this.props.selectedRows[0]

    const newRow = findNextSelectableRow(
      this.props.rowCount,
      { direction, row: lastSelection, wrap: false },
      this.canSelectRow
    )

    if (newRow != null) {
      if (this.props.onSelectionChanged) {
        const newSelection = createSelectionBetween(
          selectionOrigin,
          newRow,
          this.props.rowCount
        )
        this.props.onSelectionChanged(newSelection, source)
      }

      if (
        this.props.selectionMode === 'range' &&
        this.props.onSelectedRangeChanged
      ) {
        this.props.onSelectedRangeChanged(selectionOrigin, newRow, source)
      }

      this.scrollRowToVisible(newRow)
    }
  }

  private moveSelection(
    direction: SelectionDirection,
    source: SelectionSource
  ) {
    const lastSelection =
      this.props.selectedRows.length > 0
        ? this.props.selectedRows[this.props.selectedRows.length - 1]
        : InvalidRowIndexPath

    const newRow = findNextSelectableRow(
      this.props.rowCount,
      { direction, row: lastSelection },
      this.canSelectRow
    )

    if (newRow != null) {
      this.moveSelectionTo(newRow, source)
    }
  }

  private moveSelectionToLastSelectableRow(
    direction: SelectionDirection,
    source: SelectionSource
  ) {
    const { canSelectRow, props } = this
    const { rowCount } = props
    const row = findLastSelectableRow(direction, rowCount, canSelectRow)

    if (row !== null) {
      this.moveSelectionTo(row, source)
    }
  }

  private addSelectionToLastSelectableRow(
    direction: SelectionDirection,
    source: SelectionSource
  ) {
    const { canSelectRow, props } = this
    const { rowCount, selectedRows } = props
    const row = findLastSelectableRow(direction, rowCount, canSelectRow)

    if (row === null) {
      return
    }

    const firstRow = this.firstRowIndexPath
    const firstSelection = selectedRows[0] ?? firstRow
    const range = createSelectionBetween(firstSelection, row, rowCount)

    this.props.onSelectionChanged?.(range, source)

    const from = range.at(0) ?? firstRow
    const to = range.at(-1) ?? firstRow

    this.props.onSelectedRangeChanged?.(from, to, source)

    this.scrollRowToVisible(row)
  }

  private moveSelectionTo(indexPath: RowIndexPath, source: SelectionSource) {
    if (this.props.onSelectionChanged) {
      this.props.onSelectionChanged([indexPath], source)
    }

    if (this.props.onSelectedRowChanged) {
      if (!isValidRow(indexPath, this.props.rowCount)) {
        log.debug(
          `[List.moveSelection] unable to onSelectedRowChanged for row '${indexPath}' as it is outside the bounds`
        )
        return
      }

      this.props.onSelectedRowChanged(indexPath, source)
    }

    this.scrollRowToVisible(indexPath)
  }

  private scrollRowToVisible(indexPath: RowIndexPath, moveFocus = true) {
    if (this.rootGrid === null) {
      return
    }

    const { scrollTop } = this.state

    const rowHeight = this.getHeightForRowAtIndexPath(indexPath)
    const sectionOffset = this.getSectionScrollOffset(indexPath.section)
    const rowOffsetInSection = this.getRowOffsetInSection(indexPath)

    const grid = ReactDOM.findDOMNode(this.rootGrid)
    if (!(grid instanceof HTMLElement)) {
      return
    }
    const gridHeight = grid.getBoundingClientRect().height

    const minCellOffset =
      sectionOffset + rowOffsetInSection + rowHeight - gridHeight
    const maxCellOffset = sectionOffset + rowOffsetInSection

    const newScrollTop = Math.max(
      minCellOffset,
      Math.min(maxCellOffset, scrollTop)
    )

    this.rootGrid?.scrollToPosition({
      scrollLeft: 0,
      scrollTop: newScrollTop,
    })

    if (moveFocus) {
      this.focusRow = indexPath
      this.rowRefs.get(indexPath)?.focus({ preventScroll: true })
    }
  }

  public componentDidMount() {
    const { props } = this
    const { selectedRows, scrollToRow, setScrollTop } = props

    // If we have a selected row when we're about to mount
    // we'll scroll to it immediately.
    const row = scrollToRow ?? selectedRows.at(0)
    if (row === undefined) {
      return
    }

    const grid = this.grids.get(row.section)

    // Prefer scrollTop position over scrollToRow
    if (grid !== undefined && setScrollTop === undefined) {
      grid.scrollToCell({ rowIndex: row.row, columnIndex: 0 })
    }
  }

  public componentDidUpdate(
    prevProps: ISectionListProps,
    prevState: ISectionListState
  ) {
    const { scrollToRow, setScrollTop } = this.props
    if (
      scrollToRow !== undefined &&
      (prevProps.scrollToRow === undefined ||
        !rowIndexPathEquals(prevProps.scrollToRow, scrollToRow))
    ) {
      // Prefer scrollTop position over scrollToRow
      if (setScrollTop === undefined) {
        this.scrollRowToVisible(scrollToRow, false)
      }
    }

    if (this.grids.size > 0) {
      const hasEqualRowCount = structuralEquals(
        this.props.rowCount,
        prevProps.rowCount
      )

      // A non-exhaustive set of checks to see if our current update has already
      // triggered a re-render of the Grid. In order to do this perfectly we'd
      // have to do a shallow compare on all the props we pass to Grid but
      // this should cover the majority of cases.
      const gridHasUpdatedAlready =
        !hasEqualRowCount ||
        this.state.width !== prevState.width ||
        this.state.height !== prevState.height

      // If the number of groups doesn't change, but the size of them does, we
      // need to recompute the grid size to ensure that the rows are laid out
      // correctly.
      if (!hasEqualRowCount) {
        this.rootGrid?.recomputeGridSize()
      }

      if (!gridHasUpdatedAlready) {
        const selectedRowChanged = !structuralEquals(
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
          for (const grid of this.grids.values()) {
            grid.forceUpdate()
          }
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

  private onRowRef = (
    rowIndex: RowIndexPath,
    element: HTMLDivElement | null
  ) => {
    if (element === null) {
      this.rowRefs.delete(rowIndex)
    } else {
      this.rowRefs.set(rowIndex, element)
    }

    if (rowIndexPathEquals(rowIndex, this.focusRow)) {
      // The currently focused row is going being unmounted so we'll move focus
      // programmatically to the grid so that keyboard navigation still works
      if (element === null) {
        const rowGrid = this.grids.get(rowIndex.section)
        if (rowGrid === undefined) {
          const grid = ReactDOM.findDOMNode(rowGrid)
          if (grid instanceof HTMLElement) {
            grid.focus({ preventScroll: true })
          }
        }
      } else {
        // A previously focused row is being mounted again, we'll move focus
        // back to it
        element.focus({ preventScroll: true })
      }
    }
  }

  private getCustomRowClassNames = (rowIndex: RowIndexPath) => {
    const { rowCustomClassNameMap } = this.props
    if (rowCustomClassNameMap === undefined) {
      return undefined
    }

    const customClasses = new Array<string>()
    rowCustomClassNameMap.forEach(
      (rows: ReadonlyArray<RowIndexPath>, className: string) => {
        if (rows.includes(rowIndex)) {
          customClasses.push(className)
        }
      }
    )

    return customClasses.length === 0 ? undefined : customClasses.join(' ')
  }

  private getRowRenderer = (
    section: number,
    firstSelectableRowIndexPath: RowIndexPath | null
  ) => {
    return (params: IRowRendererParams) => {
      const { selectedRows } = this.props
      const indexPath: RowIndexPath = {
        section: section,
        row: params.rowIndex,
      }

      const selectable = this.canSelectRow(indexPath)
      const selected =
        selectedRows.findIndex(r => rowIndexPathEquals(r, indexPath)) !== -1
      const customClasses = this.getCustomRowClassNames(indexPath)

      // An unselectable row shouldn't be focusable
      let tabIndex: number | undefined = undefined
      if (selectable) {
        tabIndex =
          (selected && rowIndexPathEquals(selectedRows[0], indexPath)) ||
          (selectedRows.length === 0 &&
            firstSelectableRowIndexPath !== null &&
            rowIndexPathEquals(firstSelectableRowIndexPath, indexPath))
            ? 0
            : -1
      }

      const row = this.props.rowRenderer(indexPath)
      const sectionHasHeader =
        this.props.sectionHasHeader?.(indexPath.section) ?? false

      const element =
        this.props.insertionDragType !== undefined ? (
          <ListItemInsertionOverlay
            onDropDataInsertion={this.props.onDropDataInsertion}
            itemIndex={indexPath}
            dragType={this.props.insertionDragType}
            forcedFeedbackType={InsertionFeedbackType.None}
          >
            {row}
          </ListItemInsertionOverlay>
        ) : (
          row
        )

      const id = this.getRowId(indexPath)

      const ariaLabel =
        this.props.getRowAriaLabel !== undefined
          ? this.props.getRowAriaLabel(indexPath)
          : undefined

      return (
        <ListRow
          key={params.key}
          id={id}
          ariaLabel={ariaLabel}
          sectionHasHeader={sectionHasHeader}
          onRowRef={this.onRowRef}
          rowCount={this.props.rowCount[indexPath.section]}
          rowIndex={indexPath}
          selected={selected}
          inKeyboardInsertionMode={false}
          onRowClick={this.onRowClick}
          onRowDoubleClick={this.onRowDoubleClick}
          onRowKeyDown={this.onRowKeyDown}
          onRowMouseDown={this.onRowMouseDown}
          onRowMouseUp={this.onRowMouseUp}
          onRowFocus={this.onRowFocus}
          onRowKeyboardFocus={this.onRowKeyboardFocus}
          onRowBlur={this.onRowBlur}
          onContextMenu={this.onRowContextMenu}
          style={params.style}
          tabIndex={tabIndex}
          children={element}
          selectable={selectable}
          className={customClasses}
        />
      )
    }
  }

  public render() {
    let content: JSX.Element[] | JSX.Element | null
    if (this.resizeObserver) {
      content = this.renderContents(
        this.state.width ?? 0,
        this.state.height ?? 0
      )
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

    return (
      // eslint-disable-next-line github/a11y-role-supports-aria-props
      <div
        ref={this.onRef}
        id={this.props.id}
        className="list"
        aria-labelledby={this.props.ariaLabelledBy}
        aria-label={this.props.ariaLabel}
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

  private getRowHeight = (section: number) => {
    const rowHeight = this.props.rowHeight

    if (typeof rowHeight === 'number') {
      return rowHeight
    }

    return (params: Index) => {
      const index: RowIndexPath = {
        section: section,
        row: params.index,
      }

      return rowHeight({ index })
    }
  }

  private onRootGridRef = (ref: Grid | null) => {
    this.rootGrid = ref
  }

  private getOnGridRef = (section: number) => {
    return (ref: Grid | null) => {
      if (ref === null) {
        this.grids.delete(section)
      } else {
        this.grids.set(section, ref)
      }
    }
  }

  private onFakeScrollRef = (ref: HTMLDivElement | null) => {
    this.fakeScroll = ref
  }

  private getSectionScrollOffset = (section: number) =>
    this.props.rowCount
      .slice(0, section)
      .reduce((height, _x, idx) => height + this.getSectionHeight(idx), 0)

  private getSectionGridRenderer =
    (width: number, height: number) => (params: IRowRendererParams) => {
      const section = params.rowIndex

      // we select the last item from the selection array for this prop
      const sectionHeight = this.getSectionHeight(section)
      const offset = this.getSectionScrollOffset(section)

      const relativeScrollTop = Math.max(
        0,
        Math.min(sectionHeight, this.state.scrollTop - offset)
      )

      return (
        <Grid
          key={section}
          id={this.props.accessibleListId}
          role="listbox"
          ref={this.getOnGridRef(section)}
          autoContainerWidth={true}
          containerRole="presentation"
          aria-multiselectable={
            this.props.selectionMode !== 'single' ? true : undefined
          }
          // Set the width and columnWidth to a hardcoded large value to prevent
          columnWidth={10000}
          width={10000}
          height={Math.min(sectionHeight, height)}
          columnCount={1}
          rowCount={this.props.rowCount[section]}
          rowHeight={this.getRowHeight(section)}
          cellRenderer={this.getRowRenderer(
            section,
            this.getFirstSelectableRowIndexPath()
          )}
          scrollTop={relativeScrollTop}
          overscanRowCount={4}
          style={{ ...params.style, width: '100%' }}
          tabIndex={-1}
        />
      )
    }

  private getRowOffsetInSection(indexPath: RowIndexPath) {
    if (typeof this.props.rowHeight === 'number') {
      return indexPath.row * this.props.rowHeight
    }

    let offset = 0
    for (let i = 0; i < indexPath.row; i++) {
      offset += this.props.rowHeight({ index: indexPath })
    }
    return offset
  }

  private getSectionHeight(section: number) {
    if (typeof this.props.rowHeight === 'number') {
      return this.props.rowCount[section] * this.props.rowHeight
    }

    let height = 0
    for (let i = 0; i < this.props.rowCount[section]; i++) {
      height += this.props.rowHeight({ index: { section, row: i } })
    }
    return height
  }

  private get totalHeight() {
    return this.props.rowCount.reduce((total, _count, section) => {
      return total + this.getSectionHeight(section)
    })
  }

  private sectionHeight = ({ index }: Index) => {
    return this.getSectionHeight(index)
  }

  /**
   * Renders the react-virtualized Grid component
   *
   * @param width - The width of the Grid as given by AutoSizer
   * @param height - The height of the Grid as given by AutoSizer
   */
  private renderGrid(width: number, height: number) {
    // It is possible to send an invalid array such as [-1] to this component,
    // if you do, you get weird focus problems. We shouldn't be doing this.. but
    // if we do, send a non fatal exception to tell us about it.
    const firstSelectedRow = this.props.selectedRows.at(0)
    if (
      firstSelectedRow &&
      rowIndexPathEquals(firstSelectedRow, InvalidRowIndexPath)
    ) {
      sendNonFatalException(
        'invalidListSelection',
        new Error(
          `Invalid selected rows that contained a negative number passed to SectionList component. This will cause keyboard navigation and focus problems.`
        )
      )
    }

    const { selectedRows } = this.props
    const activeDescendant =
      selectedRows.length && this.state.rowIdPrefix
        ? this.getRowId(selectedRows[selectedRows.length - 1])
        : undefined
    const containerProps = this.getContainerProps(activeDescendant)
    // The currently selected list item is focusable but if there's no focused
    // item the list itself needs to be focusable so that you can reach it with
    // keyboard navigation and select an item.
    const tabIndex = selectedRows.length > 0 ? -1 : 0
    return (
      <FocusContainer
        className="list-focus-container"
        onKeyDown={this.onFocusContainerKeyDown}
        onFocusWithinChanged={this.onFocusWithinChanged}
      >
        <Grid
          id={this.props.accessibleListId}
          role="presentation"
          ref={this.onRootGridRef}
          autoContainerWidth={true}
          containerRole="presentation"
          containerProps={containerProps}
          width={width}
          height={height}
          columnWidth={width}
          columnCount={1}
          rowCount={this.props.rowCount.length}
          rowHeight={this.sectionHeight}
          cellRenderer={this.getSectionGridRenderer(width, height)}
          onScroll={this.onScroll}
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
   */
  private renderFakeScroll(height: number) {
    return (
      <div
        className="fake-scroll"
        ref={this.onFakeScrollRef}
        style={{ height }}
        onScroll={this.onFakeScroll}
      >
        <div style={{ height: this.totalHeight, pointerEvents: 'none' }} />
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

    if (this.rootGrid) {
      const element = ReactDOM.findDOMNode(this.rootGrid)
      if (element instanceof Element) {
        element.scrollTop = e.currentTarget.scrollTop
      }
    }

    this.setState({ scrollTop: e.currentTarget.scrollTop })

    // Make sure the root grid re-renders its children
    this.rootGrid?.recomputeGridSize()
  }

  private onRowMouseDown = (
    row: RowIndexPath,
    event: React.MouseEvent<any>
  ) => {
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
          const newSelection = createSelectionBetween(
            selectionOrigin,
            row,
            this.props.rowCount
          )
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
          let newSelection: ReadonlyArray<RowIndexPath>
          if (this.props.selectedRows.includes(row)) {
            // remove the ability to deselect the last item
            if (this.props.selectedRows.length === 1) {
              return
            }
            newSelection = this.props.selectedRows.filter(
              ix => !rowIndexPathEquals(ix, row)
            )
          } else {
            newSelection = [...this.props.selectedRows, row]
          }

          this.props.onSelectionChanged(newSelection, {
            kind: 'mouseclick',
            event,
          })
        }
      } else if (
        (this.props.selectionMode === 'range' ||
          this.props.selectionMode === 'multi') &&
        this.props.selectedRows.length > 1 &&
        this.props.selectedRows.includes(row)
      ) {
        // Do nothing. Multiple rows are already selected. We assume the user is
        // pressing down on multiple and may desire to start dragging. We will
        // invoke the single selection `onRowMouseUp` if they let go here and no
        // special keys are being pressed.
      } else if (
        this.props.selectedRows.length !== 1 ||
        (this.props.selectedRows.length === 1 &&
          !rowIndexPathEquals(row, this.props.selectedRows[0]))
      ) {
        /*
         * if no special key is pressed, and that the selection is different,
         * single selection occurs
         */
        this.selectSingleRowAfterMouseEvent(row, event)
      }
    }
  }

  private onRowMouseUp = (row: RowIndexPath, event: React.MouseEvent<any>) => {
    if (!this.canSelectRow(row)) {
      return
    }

    // macOS allow emulating a right click by holding down the ctrl key while
    // performing a "normal" click.
    const isRightClick =
      event.button === 2 || (__DARWIN__ && event.button === 0 && event.ctrlKey)

    // prevent the right-click event from changing the selection if not necessary
    if (isRightClick && this.props.selectedRows.includes(row)) {
      return
    }

    const multiSelectKey = __DARWIN__ ? event.metaKey : event.ctrlKey

    if (
      !event.shiftKey &&
      !multiSelectKey &&
      this.props.selectedRows.length > 1 &&
      this.props.selectedRows.includes(row) &&
      (this.props.selectionMode === 'range' ||
        this.props.selectionMode === 'multi')
    ) {
      // No special keys are depressed and multiple rows were selected. The
      // onRowMouseDown event was ignored for this scenario because the user may
      // desire to started dragging multiple. However, if they let go, we want a
      // new single selection to occur.
      this.selectSingleRowAfterMouseEvent(row, event)
    }
  }

  private selectSingleRowAfterMouseEvent(
    row: RowIndexPath,
    event: React.MouseEvent<any>
  ): void {
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
      if (!isValidRow(row, this.props.rowCount)) {
        log.debug(
          `[List.selectSingleRowAfterMouseEvent] unable to onSelectedRowChanged for row '${row}' as it is outside the bounds`
        )
        return
      }

      this.props.onSelectedRowChanged(row, { kind: 'mouseclick', event })
    }
  }

  private onRowClick = (row: RowIndexPath, event: React.MouseEvent<any>) => {
    if (this.canSelectRow(row) && this.props.onRowClick) {
      if (!isValidRow(row, this.props.rowCount)) {
        log.debug(
          `[List.onRowClick] unable to onRowClick for row ${row} as it is outside the bounds`
        )
        return
      }

      this.props.onRowClick(row, { kind: 'mouseclick', event })
    }
  }

  private onRowDoubleClick = (
    row: RowIndexPath,
    event: React.MouseEvent<any>
  ) => {
    if (!this.props.onRowDoubleClick) {
      return
    }

    this.props.onRowDoubleClick(row, { kind: 'mouseclick', event })
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

    this.setState({ scrollTop })

    // Make sure the root grid re-renders its children
    this.rootGrid?.recomputeGridSize()
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
    const { selectedRows, rowCount } = this.props
    const lastSelectedRow = selectedRows.at(-1)

    if (
      lastSelectedRow !== undefined &&
      isValidRow(lastSelectedRow, rowCount)
    ) {
      this.scrollRowToVisible(lastSelectedRow)
    } else {
      // TODO: decide which grid to focus
      // if (this.grid) {
      //   const element = ReactDOM.findDOMNode(this.grid) as HTMLDivElement
      //   if (element) {
      //     element.focus()
      //   }
      // }
    }
  }
}
