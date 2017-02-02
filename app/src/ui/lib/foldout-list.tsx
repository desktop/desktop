import * as React from 'react'
import * as classnames from 'classnames'

import { List } from '../list'
import { ExpandFoldoutButton } from '../lib/expand-foldout-button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

export interface IFoldoutListItem {
  /**
   * The text which will be rendered in some way for the item. This is used
   * entirely for filtering.
   */
  readonly text: string

  /** A unique identifier for the item. */
  readonly id: string
}

export interface IFoldoutListGroup<T> {
  readonly identifier: string
  readonly items: ReadonlyArray<T>
}

interface IGroup {
  readonly kind: 'group'
  readonly identifier: string
}

interface IItem<T> {
  readonly kind: 'item'
  readonly item: T
}

type IFoldoutListRow<T> = IGroup | IItem<T>

interface IFoldoutListProps<T> {
  readonly className?: string

  readonly rowHeight: number

  readonly expandButtonTitle: string

  readonly groups: ReadonlyArray<IFoldoutListGroup<T>>

  readonly selectedItem: T | null

  readonly showExpansion: boolean

  readonly renderExpansion: () => JSX.Element | null

  readonly renderItem: (item: T) => JSX.Element | null

  readonly renderGroupHeader: (identifier: string) => JSX.Element | null

  readonly onItemClick: (item: T) => void

  readonly onExpandClick: () => void

  readonly onClose: () => void

  readonly invalidationProps: any
}

interface IFoldoutListState<T> {
  readonly filter: string

  readonly rows: ReadonlyArray<IFoldoutListRow<T>>

  readonly selectedRow: number
}

export class FoldoutList<T extends IFoldoutListItem> extends React.Component<IFoldoutListProps<T>, IFoldoutListState<T>> {
  private list: List | null = null
  private filterInput: HTMLInputElement | null = null

  public constructor(props: IFoldoutListProps<T>) {
    super(props)

    this.state = this.createStateUpdate('', props)
  }

  public render() {
    return (
      <div className={classnames('foldout-list', this.props.className)}>
        <div className='foldout-list-contents'>
          <ExpandFoldoutButton
            onClick={this.props.onExpandClick}
            expanded={this.props.showExpansion}>
            {this.props.expandButtonTitle}
          </ExpandFoldoutButton>

          <Row>
            <TextBox
              labelClassName='filter-field'
              type='search'
              autoFocus={true}
              placeholder='Filter'
              onChange={this.onFilterChanged}
              onKeyDown={this.onKeyDown}
              onInputRef={this.onInputRef}/>
          </Row>

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
            invalidationProps={{ ...this.props, ...this.props.invalidationProps }}/>
        </div>

        {this.props.showExpansion ? this.props.renderExpansion() : null}

      </div>
    )
  }

  public componentWillReceiveProps(nextProps: IFoldoutListProps<T>) {
    this.setState(this.createStateUpdate(this.state.filter, nextProps))
  }

  private createStateUpdate(filter: string, props: IFoldoutListProps<T>) {
    const flattenedRows = new Array<IFoldoutListRow<T>>()
    for (const group of props.groups) {
      const items = group.items.filter(i => {
        return i.text.toLowerCase().includes(filter.toLowerCase())
      })

      if (!items.length) { continue }

      flattenedRows.push({ kind: 'group', identifier: group.identifier })
      for (const item of items) {
        flattenedRows.push({ kind: 'item', item })
      }
    }


    let selectedRow = -1
    const selectedItem = props.selectedItem
    if (selectedItem) {
      const index = flattenedRows.findIndex(i => i.kind === 'item' && i.item.id === selectedItem.id)
      // If the selected item isn't in the list (e.g., filtered out), then
      // select the first visible item.
      selectedRow = index < 0 ? flattenedRows.findIndex(i => i.kind === 'item') : index
    }

    return { filter, rows: flattenedRows, selectedRow }
  }

  private onSelectionChanged = (index: number) => {
    this.setState({ selectedRow: index })
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
    this.setState(this.createStateUpdate(text, this.props))
  }

  private canSelectRow = (index: number) => {
    const row = this.state.rows[index]
    return row.kind === 'item'
  }

  private onRowClick = (index: number) => {
    const row = this.state.rows[index]
    if (row.kind !== 'item') { return }

    this.props.onItemClick(row.item)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const list = this.list
    if (!list) { return }

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
    if (!list) { return }

    if (event.key === 'ArrowDown') {
      if (this.state.rows.length > 0) {
        this.setState({ selectedRow: list.nextSelectableRow('down', 0) }, () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (this.state.rows.length > 0) {
        this.setState({ selectedRow: list.nextSelectableRow('up', 0) }, () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'Escape') {
      if (this.state.filter.length === 0) {
        this.props.onClose()
        event.preventDefault()
      }
    } else if (event.key === 'Enter') {
      this.onRowClick(list.nextSelectableRow('down', 0))
    }
  }
}
