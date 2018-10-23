import * as React from 'react'
import * as classnames from 'classnames'

import { Branch } from '../../models/branch'

import {
  List,
  SelectionSource as ListSelectionSource,
  findNextSelectableRow,
} from '../lib/list'
import { Octicon, OcticonSymbol } from '../octicons'
import { Button } from '../lib/button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

import { match, IMatch, IMatches } from '../../lib/fuzzy-find'

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

  /** Whether this filter list instance is the branch list dropdown. */
  readonly isBranchListDropdown?: boolean

  /** The current branch. */
  readonly currentBranch?: Branch | null

  /** The height of the rows. */
  readonly rowHeight: number

  /** The ordered groups to display in the list. */
  readonly groups: ReadonlyArray<IFilterListGroup<T>>

  /** The selected item. */
  readonly selectedItem: T | null

  /** Called to render each visible item. */
  readonly renderItem: (item: T, matches: IMatches) => JSX.Element | null

  /** Called to render header for the group with the given identifier. */
  readonly renderGroupHeader?: (identifier: string) => JSX.Element | null

  /** Called to render content before/above the filter and list. */
  readonly renderPreList?: () => JSX.Element | null

  /** Called when an item is clicked. */
  readonly onItemClick?: (item: T) => void

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
}

interface IFilterListState<T extends IFilterListItem> {
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
  private filterTextBox: TextBox | null = null

  public constructor(props: IFilterListProps<T>) {
    super(props)

    this.state = createStateUpdate(props)
  }

  public componentWillMount() {
    if (this.props.filterTextBox !== undefined) {
      this.filterTextBox = this.props.filterTextBox
    }
  }

  public componentWillReceiveProps(nextProps: IFilterListProps<T>) {
    this.setState(createStateUpdate(nextProps))
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
      const itemCount = this.state.rows.filter(row => row.kind === 'item')
        .length

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
        type="search"
        autoFocus={true}
        placeholder="Filter"
        className="filter-list-filter-field"
        onValueChanged={this.onFilterValueChanged}
        onKeyDown={this.onKeyDown}
        value={this.props.filterText}
        disabled={this.props.disabled}
      />
    )
  }

  public render() {
    const branchName = this.props.currentBranch
      ? this.props.currentBranch.name
      : 'master'

    return (
      <div className={classnames('filter-list', this.props.className)}>
        {this.props.renderPreList ? this.props.renderPreList() : null}

        <Row className="filter-field-row">
          {this.props.filterTextBox === undefined ? this.renderTextBox() : null}
          {this.props.renderPostFilter ? this.props.renderPostFilter() : null}
        </Row>

        <div className="filter-list-container">{this.renderContent()}</div>

        {this.props.isBranchListDropdown && (
          <Row className="merge-button-row">
            <Button className="merge-button">
              <Octicon className="icon" symbol={OcticonSymbol.gitMerge} />
              <span title={`Commit to ${branchName}`}>
                Choose a branch to merge into <strong>{branchName}</strong>
              </span>
            </Button>
          </Row>
        )}
      </div>
    )
  }

  public selectFirstItem(focus: boolean = false) {
    if (this.list === null) {
      return
    }

    const next = findNextSelectableRow(
      this.state.rows.length,
      {
        direction: 'down',
        row: -1,
      },
      this.canSelectRow
    )

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
          selectedRows={[this.state.selectedRow]}
          onSelectedRowChanged={this.onSelectedRowChanged}
          onRowClick={this.onRowClick}
          onRowKeyDown={this.onRowKeyDown}
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
        this.onRowClick(row)
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
  props: IFilterListProps<T>
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

  return { rows: flattenedRows, selectedRow }
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
