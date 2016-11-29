import * as React from 'react'

import { List, ClickSource, SelectionSource } from '../list'
import { IMenu, MenuItem } from '../../models/app-menu'
import { MenuListItem, IMenuListItemProps } from './menu-list-item'

interface IMenuPaneProps {
  readonly depth: number
  readonly menu: IMenu
  readonly onItemClicked: (item: MenuItem) => void
  readonly onItemKeyDown: (depth: number, item: MenuItem, event: React.KeyboardEvent<any>) => void
  readonly onSelectionChanged: (depth: number, item: MenuItem, source: SelectionSource) => void
  readonly onMouseEnter: (depth: number) => void
}

interface IMenuPaneState {
  readonly items: ReadonlyArray<IMenuListItemProps>
}

const RowHeight = 30

export class MenuPane extends React.Component<IMenuPaneProps, IMenuPaneState> {

  private list: List

  public constructor(props: IMenuPaneProps) {
    super(props)
    this.state = this.createState(props)
  }

  public componentWillReceiveProps(props: IMenuPaneProps) {
    this.setState(this.createState(props))
  }

  private createState(props: IMenuPaneProps): IMenuPaneState {
    return {
      items: props.menu.items
        .filter(item => item.visible)
        .map(item => { return { item } }),
    }
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

  public render(): JSX.Element {

    const selectedItem = this.props.menu.selectedItem
    const items = this.state.items

    const selectedRow = selectedItem
      ? items.findIndex(i => i.item.id === selectedItem.id)
      : -1

    return (
      <div className='menu-pane' onMouseEnter={this.onMouseEnter}>
        <List
          ref={this.onListRef}
          rowCount={this.state.items.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderMenuItem}
          selectedRow={selectedRow}
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
