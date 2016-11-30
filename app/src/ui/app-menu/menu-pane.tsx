import * as React from 'react'

import { List, ClickSource, SelectionSource } from '../list'
import { MenuItem } from '../../models/app-menu'
import { MenuListItem, IMenuListItemProps } from './menu-list-item'

interface IMenuPaneProps {
  readonly depth: number
  readonly items: ReadonlyArray<MenuItem>
  readonly selectedItem?: MenuItem
  readonly onItemClicked: (item: MenuItem) => void
  readonly onItemKeyDown: (depth: number, item: MenuItem, event: React.KeyboardEvent<any>) => void
  readonly onSelectionChanged: (depth: number, item: MenuItem, source: SelectionSource) => void
  readonly onMouseEnter: (depth: number) => void
}

interface IMenuPaneState {
  readonly items: ReadonlyArray<IMenuListItemProps>
  readonly selectedIndex: number
}

const RowHeight = 30
const SeparatorRowHeight = 10

function createListItemProps(items: ReadonlyArray<MenuItem>): ReadonlyArray<IMenuListItemProps> {
  return items
    .filter(i => i.visible)
    .map(i => { return { item: i } })
}

function getSelectedIndex(selectedItem: MenuItem | undefined, items: ReadonlyArray<IMenuListItemProps>) {
  return selectedItem
    ? items.findIndex(i => i.item.id === selectedItem.id)
    : -1
}

export class MenuPane extends React.Component<IMenuPaneProps, IMenuPaneState> {

  private list: List

  public constructor(props: IMenuPaneProps) {
    super(props)
    this.state = this.createState(props)
  }

  public componentWillReceiveProps(props: IMenuPaneProps) {
    // No need to recreate the filtered list if it hasn't changed,
    // we only have to update the selected item
    if (this.props.items === props.items) {
      // Has the selection changed?
      if (this.props.selectedItem !== props.selectedItem) {
        const selectedIndex = getSelectedIndex(props.selectedItem, this.state.items)
        this.setState(Object.assign({}, this.state, { selectedIndex }))
      }
    } else {
      this.setState(this.createState(props))
    }
  }

  private createState(props: IMenuPaneProps): IMenuPaneState {

    const items = createListItemProps(props.items)
    const selectedIndex = getSelectedIndex(props.selectedItem, items)

    return { items, selectedIndex }
  }

  private onRowClick = (row: number, source: ClickSource) => {
    const item = this.state.items[row].item

    if (item.type !== 'separator' && item.enabled) {
      this.props.onItemClicked(item)
    }
  }

  private onSelectionChanged = (row: number, source: SelectionSource) => {
    const item = this.state.items[row].item
    this.props.onSelectionChanged(this.props.depth, item, source)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const item = this.state.items[row].item
    this.props.onItemKeyDown(this.props.depth, item, event)
  }

  private canSelectRow = (row: number) => {
    const item = this.state.items[row].item

    if (item.type === 'separator') { return false }

    return item.enabled && item.visible
  }

  private onListRef = (list: List) => {
    this.list = list
  }

  private onMouseEnter = (event: React.MouseEvent<any>) => {
    this.props.onMouseEnter(this.props.depth)
  }

  private renderMenuItem = (row: number) => {
    const props = this.state.items[row]

    return <MenuListItem key={props.item.id} {...props} />
  }

  private rowHeight = (info: { index: number }) => {
    const item = this.state.items[info.index].item
    return item.type === 'separator' ? SeparatorRowHeight : RowHeight
  }

  public render(): JSX.Element {

    return (
      <div className='menu-pane' onMouseEnter={this.onMouseEnter}>
        <List
          ref={this.onListRef}
          rowCount={this.state.items.length}
          rowHeight={this.rowHeight}
          rowRenderer={this.renderMenuItem}
          selectedRow={this.state.selectedIndex}
          onRowClick={this.onRowClick}
          onSelectionChanged={this.onSelectionChanged}
          canSelectRow={this.canSelectRow}
          onRowKeyDown={this.onRowKeyDown}
          invalidationProps={this.state.items}
          selectOnHover={true}
        />
      </div>
    )
  }

  public focus() {
    if (this.list) {
      this.list.focus()
    }
  }
}
