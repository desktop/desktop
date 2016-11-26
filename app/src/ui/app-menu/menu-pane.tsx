import * as React from 'react'
import { List, ClickSource, SelectionSource } from '../list'
import { Octicon, OcticonSymbol } from '../octicons'

interface IMenuPaneProps {
  readonly depth: number,
  readonly menu: Electron.Menu
  readonly parentItem?: Electron.MenuItem
  readonly selectedItem?: Electron.MenuItem
  readonly onItemClicked: (depth: number, item: Electron.MenuItem) => void
  readonly onItemKeyDown: (depth: number, item: Electron.MenuItem, event: React.KeyboardEvent<any>, parentItem?: Electron.MenuItem) => void
  readonly onSelectionChanged: (depth: number, item: Electron.MenuItem, source: SelectionSource) => void
}

const RowHeight = 30

export class MenuPane extends React.Component<IMenuPaneProps, void> {

  private list: List

  private renderMenuItem = (row: number) => {
    const item = this.props.menu.items[row]

    if (item.type === 'separator') {
      return null
    }

    const arrow = item.type === 'submenu'
      ? <Octicon className='submenu-arrow' symbol={OcticonSymbol.triangleRight} />
      : null

    return (
      <div className='menu-item'>
        <div className='label'>{item.label}</div>
        {arrow}
      </div>
    )
  }

  private onRowClick = (row: number, source: ClickSource) => {
    const item = this.props.menu.items[row]
    this.props.onItemClicked(this.props.depth, item)
  }

  private onSelectionChanged = (row: number, source: SelectionSource) => {
    const item = this.props.menu.items[row]
    this.props.onSelectionChanged(this.props.depth, item, source)
  }

  private onRowKeyDown = (row: number, event: React.KeyboardEvent<any>) => {
    const item = this.props.menu.items[row]
    this.props.onItemKeyDown(this.props.depth, item, event, this.props.parentItem)
  }

  private onListRef = (list: List) => {
    this.list = list
  }

  public render(): JSX.Element {

    const selectedRow = this.props.selectedItem
      ? this.props.menu.items.indexOf(this.props.selectedItem)
      : -1

    return (
      <div className='menu-pane'>
        <List
          ref={this.onListRef}
          rowCount={this.props.menu.items.length}
          rowHeight={RowHeight}
          rowRenderer={this.renderMenuItem}
          selectedRow={selectedRow}
          onRowClick={this.onRowClick}
          onSelectionChanged={this.onSelectionChanged}
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
