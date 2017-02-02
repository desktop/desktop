import * as React from 'react'
import * as classnames from 'classnames'

import { List } from '../list'
import { ExpandFoldoutButton } from '../lib/expand-foldout-button'
import { TextBox } from '../lib/text-box'
import { Row } from '../lib/row'

interface IFoldoutListItem {
  readonly text?: string

  readonly id?: string

  readonly selectable: boolean
}

interface IFoldoutListProps<T> {
  readonly className?: string

  readonly rowHeight: number

  readonly expandButtonTitle: string

  readonly items: ReadonlyArray<T>

  readonly selectedItem: T | null

  readonly showExpansion: boolean

  readonly renderExpansion: () => JSX.Element | null

  readonly renderItem: (item: T) => JSX.Element | null

  readonly onItemClick: (item: T) => void

  readonly onExpandClick: () => void

  readonly onClose: () => void

  readonly invalidationProps: any
}

interface IFoldoutListState<T> {
  readonly filter: string

  readonly items: ReadonlyArray<T>

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
    console.log('render', this.state.items.length)
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
            rowCount={this.state.items.length}
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
    const filteredItems = props.items.filter(i => {
      const text = i.text
      if (text) {
        return text.toLowerCase().includes(filter.toLowerCase())
      } else {
        return true
      }
    })

    let selectedRow = -1
    const selectedItem = props.selectedItem
    if (selectedItem) {
      const index = filteredItems.findIndex(i => i.id === selectedItem.id)
      // If the selected item isn't in the list (e.g., filtered out), then
      // select the first visible item.
      selectedRow = index < 0 ? filteredItems.findIndex(i => i.selectable) : index
    }

    return { filter, items: filteredItems, selectedRow }
  }

  private onSelectionChanged = (row: number) => {
    this.setState({ selectedRow: row })
  }

  private renderRow = (row: number) => {
    const item = this.state.items[row]
    return this.props.renderItem(item)
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

  private canSelectRow = (row: number) => {
    const item = this.state.items[row]
    return item.selectable
  }

  private onRowClick = (row: number) => {
    const item = this.state.items[row]
    if (!item.selectable) { return }

    this.props.onItemClick(item)
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
      if (this.state.items.length > 0) {
        this.setState({ selectedRow: list.nextSelectableRow('down', 0) }, () => {
          list.focus()
        })
      }

      event.preventDefault()
    } else if (event.key === 'ArrowUp') {
      if (this.state.items.length > 0) {
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
