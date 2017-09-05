import * as React from 'react'
import * as classnames from 'classnames'

import { List, SelectionSource as ListSelectionSource } from '../list'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

/** An item in the filter list. */
export interface IFilterListItem {
  /** The text which represents the item. This is used for filtering. */
  readonly text: string

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
  readonly groups: ReadonlyArray<IFilterListGroup<T>>

  /** The selected item. */
  readonly selectedItem: T | null

  /** Called to render each visible item. */
  readonly renderItem: (item: T) => JSX.Element | null

  /** Called to render header for the group with the given identifier. */
  readonly renderGroupHeader: (identifier: string) => JSX.Element | null

  /** Called to render content before/above the filter and list. */
  readonly renderPreList?: () => JSX.Element | null

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: T) => void

  /**
   * This function will be called when the selection changes as a result of a
   * user keyboard or mouse action (i.e. not when props change). Note that this
   * differs from `onRowSelected`. For example, it won't be called if an already
   * selected row is clicked on.
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
   * Called when a key down happens in the filter field. Users have a chance to
   * respond or cancel the default behavior by calling `preventDefault`.
   */
  readonly onFilterKeyDown?: (
    filter: string,
    event: React.KeyboardEvent<HTMLInputElement>
  ) => void

  /** Any props which should cause a re-render if they change. */
  readonly invalidationProps: any
}

interface IFilterListState<T extends IFilterListItem> {
  readonly filter: string

  readonly rows: ReadonlyArray<IFilterListRow<T>>

  readonly selectedRow: number
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
  private filterInput: HTMLInputElement | null = null

  public constructor(props: IFilterListProps<T>) {
    super(props)

    this.state = createStateUpdate('', props)
  }

  public render() {
    return (
      <div className={classnames('filter-list', this.props.className)}>
        {this.props.renderPreList ? this.props.renderPreList() : null}

        <Row className="filter-field-row">
          <TextBox
            type="search"
            autoFocus={true}
            placeholder="Filter"
            className="filter-list-filter-field"
            onChange={this.onFilterChanged}
            onKeyDown={this.onKeyDown}
            onInputRef={this.onInputRef}
          />
        </Row>

        <div className="filter-list-container">
          <List
            rowCount={this.state.rows.length}
            rowRenderer={this.renderRow}
            rowHeight={this.props.rowHeight}
            selectedRow={this.state.selectedRow}
            onSelectionChanged={this.onSelectionChanged}
            onRowClick={this.onRowClick}
            onRowKeyDown={this.onRowKeyDown}
            canSelectRow={this.canSelectRow}
            ref={this.onListRef}
            invalidationProps={{
              ...this.props,
              ...this.props.invalidationProps,
            }}
          />
        </div>
      </div>
    )
  }

  public componentWillReceiveProps(nextProps: IFilterListProps<T>) {
    this.setState(createStateUpdate(this.state.filter, nextProps))
  }

  private onSelectionChanged = (index: number, source: SelectionSource) => {
    this.setState({ selectedRow: index })

    if (this.props.onSelectionChanged) {
      const row = this.state.rows[index]
      if (row.kind === 'item') {
        this.props.onSelectionChanged(row.item, source)
      }
    }
  }

  private renderRow = (index: number) => {
    const row = this.state.rows[index]
    if (row.kind === 'item') {
      return this.props.renderItem(row.item)
    } else {
      return this.props.renderGroupHeader(row.identifier)
    }
  }

  private onListRef = (instance: List | null) => {
    this.list = instance
  }

  private onInputRef = (instance: HTMLInputElement | null) => {
    this.filterInput = instance
  }

  private onFilterChanged = (event: React.FormEvent<HTMLInputElement>) => {
    const text = event.currentTarget.value
    this.setState(createStateUpdate(text, this.props))
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
            filterText: this.state.filter,
          })
        }
      }
    }
  }

  private canSelectRow = (index: number) => {
    const row = this.state.rows[index]
    return row.kind === 'item'
  }

  private onRowClick = (index: number) => {
    if (this.props.onItemClick) {
      const row = this.state.rows[index]

      if (row.kind === 'item') {
        this.props.onItemClick(row.item)
      }
    }
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const list = this.list
    if (!list) {
      return
    }

    let focusInput = false
    const firstSelectableRow = list.nextSelectableRow('down', 0)
    const lastSelectableRow = list.nextSelectableRow('up', 0)
    if (event.key === 'ArrowUp' && row === firstSelectableRow) {
      focusInput = true
    } else if (event.key === 'ArrowDown' && row === lastSelectableRow) {
      focusInput = true
    }

    if (focusInput) {
      const input = this.filterInput
      if (input) {
        event.preventDefault()
        input.focus()
      }
    }
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const list = this.list
    if (!list) {
      return
    }

    if (this.props.onFilterKeyDown) {
      this.props.onFilterKeyDown(this.state.filter, event)
    }

    if (event.defaultPrevented) {
      return
    }

    if (event.key === 'ArrowDown') {
      if (this.state.rows.length > 0) {
        this.setState(
          { selectedRow: list.nextSelectableRow('down', 0) },
          () => {
            list.focus()
          }
        )
      }

      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (this.state.rows.length > 0) {
        this.setState({ selectedRow: list.nextSelectableRow('up', 0) }, () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'Enter') {
      // no repositories currently displayed, bail out
      if (!this.state.rows.length) {
        event.preventDefault()
        return
      }

      const row = list.nextSelectableRow('down', 0)
      this.onRowClick(row)
    }
  }
}

function createStateUpdate<T extends IFilterListItem>(
  filter: string,
  props: IFilterListProps<T>
) {
  const flattenedRows = new Array<IFilterListRow<T>>()
  for (const group of props.groups) {
    const items = group.items.filter(i => {
      return i.text.toLowerCase().includes(filter.toLowerCase())
    })

    if (!items.length) {
      continue
    }

    flattenedRows.push({ kind: 'group', identifier: group.identifier })
    for (const item of items) {
      flattenedRows.push({ kind: 'item', item })
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

  return { filter, rows: flattenedRows, selectedRow }
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
