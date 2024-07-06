import * as React from 'react'
import classnames from 'classnames'

import {
  List,
  SelectionSource as ListSelectionSource,
  findNextSelectableRow,
  ClickSource,
  SelectionDirection,
} from '../lib/list'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

import { match, IMatch, IMatches } from '../../lib/fuzzy-find'
import { AriaLiveContainer } from '../accessibility/aria-live-container'

/** An item in the filter list. */
export interface IFilterListItem {
  /** The text which represents the item. This is used for filtering. */
  readonly text: ReadonlyArray<string>

  /** A unique identifier for the item. */
  readonly id: string
}

/** A group of items in the list. */
export interface IFilterListGroup<T extends IFilterListItem> {
  /** The identifier for this group. */
  readonly identifier: string

  /** The items in the group. */
  readonly items: ReadonlyArray<T>
}

interface IFlattenedGroup {
  readonly kind: 'group'
  readonly identifier: string
}

interface IFlattenedItem<T extends IFilterListItem> {
  readonly kind: 'item'
  readonly item: T
  /** Array of indexes in `item.text` that should be highlighted */
  readonly matches: IMatches
}

/**
 * A row in the list. This is used internally after the user-provided groups are
 * flattened.
 */
type IFilterListRow<T extends IFilterListItem> =
  | IFlattenedGroup
  | IFlattenedItem<T>

interface IFilterListProps<T extends IFilterListItem> {
  /** A class name for the wrapping element. */
  readonly className?: string

  /** The height of the rows. */
  readonly rowHeight: number

  /** The ordered groups to display in the list. */
  // eslint-disable-next-line react/no-unused-prop-types
  readonly groups: ReadonlyArray<IFilterListGroup<T>>

  /** The selected item. */
  readonly selectedItem: T | null

  /** Called to render each visible item. */
  readonly renderItem: (item: T, matches: IMatches) => JSX.Element | null

  /** Called to render header for the group with the given identifier. */
  readonly renderGroupHeader?: (identifier: string) => JSX.Element | null

  /** Called to render content before/above the filter and list. */
  readonly renderPreList?: () => JSX.Element | null

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
  readonly onItemClick?: (item: T, source: ClickSource) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). This function
   * will not be invoked when an already selected row is clicked on.
   *
   * @param selectedItem - The item that was just selected
   * @param source       - The kind of user action that provoked the change,
   *                       either a pointer device press, or a keyboard event
   *                       (arrow up/down)
   */
  readonly onSelectionChanged?: (
    selectedItem: T | null,
    source: SelectionSource
  ) => void

  /**
   * Called when a key down happens in the filter text input. Users have a
   * chance to respond or cancel the default behavior by calling
   * `preventDefault()`.
   */
  readonly onFilterKeyDown?: (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  /** Called when the Enter key is pressed in field of type search */
  readonly onEnterPressedWithoutFilteredItems?: (text: string) => void

  /** The current filter text to use in the form */
  readonly filterText?: string

  /** Called when the filter text is changed by the user */
  readonly onFilterTextChanged?: (text: string) => void

  /**
   * Whether or not the filter list should allow selection
   * and filtering. Defaults to false.
   */
  readonly disabled?: boolean

  /** Any props which should cause a re-render if they change. */
  readonly invalidationProps: any

  /** Called to render content after the filter. */
  readonly renderPostFilter?: () => JSX.Element | null

  /** Called when there are no items to render.  */
  readonly renderNoItems?: () => JSX.Element | null

  /**
   * A reference to a TextBox that will be used to control this component.
   *
   * See https://github.com/desktop/desktop/issues/4317 for refactoring work to
   * make this more composable which should make this unnecessary.
   */
  readonly filterTextBox?: TextBox

  /**
   * Callback to fire when the items in the filter list are updated
   */
  readonly onFilterListResultsChanged?: (resultCount: number) => void

  /** Placeholder text for text box. Default is "Filter". */
  readonly placeholderText?: string

  /** If true, we do not render the filter. */
  readonly hideFilterRow?: boolean

  /**
   * A handler called whenever a context menu event is received on the
   * row container element.
   *
   * The context menu is invoked when a user right clicks the row or
   * uses keyboard shortcut.s
   */
  readonly onItemContextMenu?: (
    item: T,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
}

interface IFilterListState<T extends IFilterListItem> {
  readonly rows: ReadonlyArray<IFilterListRow<T>>
  readonly selectedRow: number
  readonly filterValue: string
  readonly filterValueChanged: boolean
}

/**
 * Interface describing a user initiated selection change event
 * originating from changing the filter text.
 */
export interface IFilterSelectionSource {
  kind: 'filter'

  /** The filter text at the time the selection event was raised.  */
  filterText: string
}

export type SelectionSource = ListSelectionSource | IFilterSelectionSource

/** A List which includes the ability to filter based on its contents. */
export class FilterList<T extends IFilterListItem> extends React.Component<
  IFilterListProps<T>,
  IFilterListState<T>
> {
  private list: List | null = null
  private filterTextBox: TextBox | null = null

  public constructor(props: IFilterListProps<T>) {
    super(props)

    if (props.filterTextBox !== undefined) {
      this.filterTextBox = props.filterTextBox
    }

    this.state = createStateUpdate(props, null)
  }

  public componentWillReceiveProps(nextProps: IFilterListProps<T>) {
    this.setState(createStateUpdate(nextProps, this.state))
  }

  public componentDidUpdate(
    prevProps: IFilterListProps<T>,
    prevState: IFilterListState<T>
  ) {
    if (this.props.onSelectionChanged) {
      const oldSelectedItemId = getItemIdFromRowIndex(
        prevState.rows,
        prevState.selectedRow
      )
      const newSelectedItemId = getItemIdFromRowIndex(
        this.state.rows,
        this.state.selectedRow
      )

      if (oldSelectedItemId !== newSelectedItemId) {
        const propSelectionId = this.props.selectedItem
          ? this.props.selectedItem.id
          : null

        if (propSelectionId !== newSelectedItemId) {
          const newSelectedItem = getItemFromRowIndex(
            this.state.rows,
            this.state.selectedRow
          )
          this.props.onSelectionChanged(newSelectedItem, {
            kind: 'filter',
            filterText: this.props.filterText || '',
          })
        }
      }
    }

    if (this.props.onFilterListResultsChanged !== undefined) {
      const itemCount = this.state.rows.filter(
        row => row.kind === 'item'
      ).length

      this.props.onFilterListResultsChanged(itemCount)
    }
  }

  public componentDidMount() {
    if (this.filterTextBox !== null) {
      this.filterTextBox.selectAll()
    }
  }

  public renderTextBox() {
    return (
      <TextBox
        ref={this.onTextBoxRef}
        displayClearButton={true}
        autoFocus={true}
        placeholder={this.props.placeholderText || 'Filter'}
        className="filter-list-filter-field"
        onValueChanged={this.onFilterValueChanged}
        onEnterPressed={this.onEnterPressed}
        onKeyDown={this.onKeyDown}
        value={this.props.filterText}
        disabled={this.props.disabled}
      />
    )
  }

  public renderLiveContainer() {
    if (!this.state.filterValueChanged) {
      return null
    }

    const itemRows = this.state.rows.filter(row => row.kind === 'item')
    const resultsPluralized = itemRows.length === 1 ? 'result' : 'results'
    const screenReaderMessage = `${itemRows.length} ${resultsPluralized}`

    return (
      <AriaLiveContainer
        message={screenReaderMessage}
        trackedUserInput={this.state.filterValue}
      />
    )
  }

  public renderFilterRow() {
    if (this.props.hideFilterRow === true) {
      return null
    }

    return (
      <Row className="filter-field-row">
        {this.props.filterTextBox === undefined ? this.renderTextBox() : null}
        {this.props.renderPostFilter ? this.props.renderPostFilter() : null}
      </Row>
    )
  }

  public render() {
    return (
      <div className={classnames('filter-list', this.props.className)}>
        {this.renderLiveContainer()}

        {this.props.renderPreList ? this.props.renderPreList() : null}

        {this.renderFilterRow()}

        <div className="filter-list-container">{this.renderContent()}</div>
      </div>
    )
  }

  public selectNextItem(
    focus: boolean = false,
    inDirection: SelectionDirection = 'down'
  ) {
    if (this.list === null) {
      return
    }
    let next: number | null = null

    if (
      this.state.selectedRow === -1 ||
      this.state.selectedRow === this.state.rows.length
    ) {
      next = findNextSelectableRow(
        this.state.rows.length,
        {
          direction: inDirection,
          row: -1,
        },
        this.canSelectRow
      )
    } else {
      next = findNextSelectableRow(
        this.state.rows.length,
        {
          direction: inDirection,
          row: this.state.selectedRow,
        },
        this.canSelectRow
      )
    }

    if (next !== null) {
      this.setState({ selectedRow: next }, () => {
        if (focus && this.list !== null) {
          this.list.focus()
        }
      })
    }
  }

  private renderContent() {
    if (this.state.rows.length === 0 && this.props.renderNoItems) {
      return this.props.renderNoItems()
    } else {
      return (
        <List
          ref={this.onListRef}
          rowCount={this.state.rows.length}
          rowRenderer={this.renderRow}
          rowHeight={this.props.rowHeight}
          selectedRows={
            this.state.selectedRow === -1 ? [] : [this.state.selectedRow]
          }
          onSelectedRowChanged={this.onSelectedRowChanged}
          onRowClick={this.onRowClick}
          onRowKeyDown={this.onRowKeyDown}
          onRowContextMenu={this.onRowContextMenu}
          canSelectRow={this.canSelectRow}
          invalidationProps={{
            ...this.props,
            ...this.props.invalidationProps,
          }}
        />
      )
    }
  }

  private renderRow = (index: number) => {
    const row = this.state.rows[index]
    if (row.kind === 'item') {
      return this.props.renderItem(row.item, row.matches)
    } else if (this.props.renderGroupHeader) {
      return this.props.renderGroupHeader(row.identifier)
    } else {
      return null
    }
  }

  private onTextBoxRef = (component: TextBox | null) => {
    this.filterTextBox = component
  }

  private onListRef = (instance: List | null) => {
    this.list = instance
  }

  private onFilterValueChanged = (text: string) => {
    if (this.props.onFilterTextChanged) {
      this.props.onFilterTextChanged(text)
    }
  }

  private onEnterPressed = (text: string) => {
    const rows = this.state.rows.length
    if (
      rows === 0 &&
      text.trim().length > 0 &&
      this.props.onEnterPressedWithoutFilteredItems !== undefined
    ) {
      this.props.onEnterPressedWithoutFilteredItems(text)
    }
  }

  private onSelectedRowChanged = (index: number, source: SelectionSource) => {
    this.setState({ selectedRow: index })

    if (this.props.onSelectionChanged) {
      const row = this.state.rows[index]
      if (row.kind === 'item') {
        this.props.onSelectionChanged(row.item, source)
      }
    }
  }

  private canSelectRow = (index: number) => {
    if (this.props.disabled) {
      return false
    }

    const row = this.state.rows[index]
    return row.kind === 'item'
  }

  private onRowClick = (index: number, source: ClickSource) => {
    if (this.props.onItemClick) {
      const row = this.state.rows[index]

      if (row.kind === 'item') {
        this.props.onItemClick(row.item, source)
      }
    }
  }

  private onRowContextMenu = (
    index: number,
    source: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!this.props.onItemContextMenu) {
      return
    }

    const row = this.state.rows[index]

    if (row.kind !== 'item') {
      return
    }

    this.props.onItemContextMenu(row.item, source)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const list = this.list
    if (!list) {
      return
    }

    const rowCount = this.state.rows.length

    const firstSelectableRow = findNextSelectableRow(
      rowCount,
      { direction: 'down', row: -1 },
      this.canSelectRow
    )
    const lastSelectableRow = findNextSelectableRow(
      rowCount,
      { direction: 'up', row: 0 },
      this.canSelectRow
    )

    let shouldFocus = false

    if (event.key === 'ArrowUp' && row === firstSelectableRow) {
      shouldFocus = true
    } else if (event.key === 'ArrowDown' && row === lastSelectableRow) {
      shouldFocus = true
    }

    if (shouldFocus) {
      const textBox = this.filterTextBox

      if (textBox) {
        event.preventDefault()
        textBox.focus()
      }
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = this.list
    const key = event.key

    if (!list) {
      return
    }

    if (this.props.onFilterKeyDown) {
      this.props.onFilterKeyDown(event)
    }

    if (event.defaultPrevented) {
      return
    }

    const rowCount = this.state.rows.length

    if (key === 'ArrowDown') {
      if (rowCount > 0) {
        const selectedRow = findNextSelectableRow(
          rowCount,
          { direction: 'down', row: -1 },
          this.canSelectRow
        )
        if (selectedRow != null) {
          this.setState({ selectedRow }, () => {
            list.focus()
          })
        }
      }

      event.preventDefault()
    } else if (key === 'ArrowUp') {
      if (rowCount > 0) {
        const selectedRow = findNextSelectableRow(
          rowCount,
          { direction: 'up', row: 0 },
          this.canSelectRow
        )
        if (selectedRow != null) {
          this.setState({ selectedRow }, () => {
            list.focus()
          })
        }
      }

      event.preventDefault()
    } else if (key === 'Enter') {
      // no repositories currently displayed, bail out
      if (rowCount === 0) {
        return event.preventDefault()
      }

      const filterText = this.props.filterText

      if (filterText !== undefined && !/\S/.test(filterText)) {
        return event.preventDefault()
      }

      const row = findNextSelectableRow(
        rowCount,
        { direction: 'down', row: -1 },
        this.canSelectRow
      )

      if (row != null) {
        this.onRowClick(row, { kind: 'keyboard', event })
      }
    }
  }
}

export function getText<T extends IFilterListItem>(
  item: T
): ReadonlyArray<string> {
  return item['text']
}

function createStateUpdate<T extends IFilterListItem>(
  props: IFilterListProps<T>,
  state: IFilterListState<T> | null
) {
  const flattenedRows = new Array<IFilterListRow<T>>()
  const filter = (props.filterText || '').toLowerCase()

  for (const group of props.groups) {
    const items: ReadonlyArray<IMatch<T>> = filter
      ? match(filter, group.items, getText)
      : group.items.map(item => ({
          score: 1,
          matches: { title: [], subtitle: [] },
          item,
        }))

    if (!items.length) {
      continue
    }

    if (props.renderGroupHeader) {
      flattenedRows.push({ kind: 'group', identifier: group.identifier })
    }

    for (const { item, matches } of items) {
      flattenedRows.push({ kind: 'item', item, matches })
    }
  }

  let selectedRow = -1
  const selectedItem = props.selectedItem
  if (selectedItem) {
    selectedRow = flattenedRows.findIndex(
      i => i.kind === 'item' && i.item.id === selectedItem.id
    )
  }

  if (selectedRow < 0 && filter.length) {
    // If the selected item isn't in the list (e.g., filtered out), then
    // select the first visible item.
    selectedRow = flattenedRows.findIndex(i => i.kind === 'item')
  }

  // Stay true if already set, otherwise become true if the filter has content
  const filterValueChanged = state?.filterValueChanged
    ? true
    : filter.length > 0

  return {
    rows: flattenedRows,
    selectedRow,
    filterValue: filter,
    filterValueChanged,
  }
}

function getItemFromRowIndex<T extends IFilterListItem>(
  items: ReadonlyArray<IFilterListRow<T>>,
  index: number
): T | null {
  if (index >= 0 && index < items.length) {
    const row = items[index]

    if (row.kind === 'item') {
      return row.item
    }
  }

  return null
}

function getItemIdFromRowIndex<T extends IFilterListItem>(
  items: ReadonlyArray<IFilterListRow<T>>,
  index: number
): string | null {
  const item = getItemFromRowIndex(items, index)
  return item ? item.id : null
}
