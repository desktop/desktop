import * as React from 'react'
import { MenuItem, IMenuItem, ISeparatorMenuItem } from '../../models/app-menu'
import { MenuPane } from '../app-menu'
import { SelectionSource } from '../list'

interface IAddMenuProps {
  readonly items: ReadonlyArray<IMenuItem | ISeparatorMenuItem>
  readonly selectedItem?: MenuItem
  readonly onItemClicked: (item: MenuItem) => void
  readonly onSelectionChanged: (selectedItem: MenuItem) => void
}

export class AddMenu extends React.Component<IAddMenuProps, void> {

  private onItemClicked = (depth: number, item: MenuItem, source: SelectionSource) => {
    this.props.onItemClicked(item)
  }

  private onSelectionChanged = (depth: number, item: MenuItem) => {
    this.props.onSelectionChanged(item)
  }

  public render() {
    return <MenuPane
      depth={0}
      items={this.props.items}
      selectedItem={this.props.selectedItem}
      onItemClicked={this.onItemClicked}
      onSelectionChanged={this.onSelectionChanged}
      enableAccessKeyNavigation={false}
    />
  }
}
