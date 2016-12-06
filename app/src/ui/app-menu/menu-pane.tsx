import * as React from 'react'

import { List, ClickSource, SelectionSource } from '../list'
import { MenuItem, itemMayHaveAccessKey, itemIsSelectable } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'

interface IMenuPaneProps {
  readonly depth: number
  readonly items: ReadonlyArray<MenuItem>
  readonly selectedItem?: MenuItem
  readonly onItemClicked: (item: MenuItem) => void
  readonly onItemKeyDown: (depth: number, item: MenuItem, event: React.KeyboardEvent<any>) => void
  readonly onSelectionChanged: (depth: number, item: MenuItem, source: SelectionSource) => void
  readonly onMouseEnter: (depth: number) => void
  readonly enableAccessKeyNavigation: boolean
}

interface IMenuPaneState {
  readonly items: ReadonlyArray<MenuItem>
  readonly selectedIndex: number
}

const RowHeight = 30
const SeparatorRowHeight = 10

function getSelectedIndex(selectedItem: MenuItem | undefined, items: ReadonlyArray<MenuItem>) {
  return selectedItem
    ? items.findIndex(i => i.id === selectedItem.id)
    : -1
}

export class MenuPane extends React.Component<IMenuPaneProps, IMenuPaneState> {

  private list: List

  public constructor(props: IMenuPaneProps) {
    super(props)
    this.state = this.createState(props)
  }

  public componentWillReceiveProps(nextProps: IMenuPaneProps) {
    // No need to recreate the filtered list if it hasn't changed,
    // we only have to update the selected item
    if (this.props.items === nextProps.items) {
      // Has the selection changed?
      if (this.props.selectedItem !== nextProps.selectedItem) {
        const selectedIndex = getSelectedIndex(nextProps.selectedItem, this.state.items)
        this.setState({ items: this.state.items, selectedIndex })
      }
    } else {
      this.setState(this.createState(nextProps))
    }
  }

  private createState(props: IMenuPaneProps): IMenuPaneState {

    const items = new Array<MenuItem>()
    const selectedItem = this.props.selectedItem

    let selectedIndex = -1

    // Filter out all invisible items and maintain the correct
    // selected index (if possible)
    for (let i = 0; i < props.items.length; i++) {
      const item = props.items[i]

      if (item.visible) {
        items.push(item)
        if (item === selectedItem) {
          selectedIndex = items.length - 1
        }
      }
    }

    return { items, selectedIndex }
  }

  private onRowClick = (row: number, source: ClickSource) => {
    const item = this.state.items[row]

    if (item.type !== 'separator' && item.enabled) {
      this.props.onItemClicked(item)
    }
  }

  private onSelectionChanged = (row: number, source: SelectionSource) => {
    const item = this.state.items[row]
    this.props.onSelectionChanged(this.props.depth, item, source)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const item = this.state.items[row]
    this.props.onItemKeyDown(this.props.depth, item, event)
  }

  private canSelectRow = (row: number) => {
    const item = this.state.items[row]
    return itemIsSelectable(item)
  }

  private onListRef = (list: List) => {
    this.list = list
  }

  private onMouseEnter = (event: React.MouseEvent<any>) => {
    this.props.onMouseEnter(this.props.depth)
  }

  private renderMenuItem = (row: number) => {
    const item = this.state.items[row]

    return <MenuListItem key={item.id} item={item} highlightAccessKey={this.props.enableAccessKeyNavigation} />
  }

  private rowHeight = (info: { index: number }) => {
    const item = this.state.items[info.index]
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
