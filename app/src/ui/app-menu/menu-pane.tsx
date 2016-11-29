import * as React from 'react'

import { List, ClickSource, SelectionSource } from '../list'
import { IMenu, MenuItem } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'

interface IMenuPaneProps {
  readonly depth: number
  readonly menu: IMenu
  readonly onItemClicked: (item: MenuItem) => void
  readonly onItemKeyDown: (depth: number, item: MenuItem, event: React.KeyboardEvent<any>) => void
  readonly onSelectionChanged: (depth: number, item: MenuItem, source: SelectionSource) => void
  readonly onMouseEnter: (depth: number) => void
}

const RowHeight = 30

export class MenuPane extends React.Component<IMenuPaneProps, void> {

  private list: List

  private onRowClick = (row: number, source: ClickSource) => {
    const item = this.props.menu.items[row]
    this.props.onItemClicked(item)
  }

  private onSelectionChanged = (row: number, source: SelectionSource) => {
    const item = this.props.menu.items[row]
    this.props.onSelectionChanged(this.props.depth, item, source)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const item = this.props.menu.items[row]
    this.props.onItemKeyDown(this.props.depth, item, event)
  }

  private canSelectRow = (row: number) => {
    const item = this.props.menu.items[row]

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
    const item = this.props.menu.items[row]

    return <MenuListItem item={item} />
  }

  public render(): JSX.Element {

    const selectedItem = this.props.menu.selectedItem

    const selectedRow = selectedItem
      ? this.props.menu.items.indexOf(selectedItem)
      : -1

    return (
      <div className='menu-pane' onMouseEnter={this.onMouseEnter}>
        <List
          ref={this.onListRef}
          rowCount={this.props.menu.items.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderMenuItem}
          selectedRow={selectedRow}
          onRowClick={this.onRowClick}
          onSelectionChanged={this.onSelectionChanged}
          canSelectRow={this.canSelectRow}
          onRowKeyDown={this.onRowKeyDown}
          invalidationProps={this.props.menu}
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
