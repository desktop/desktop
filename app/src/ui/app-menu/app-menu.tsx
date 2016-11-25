import * as React from 'react'
import { MenuPane } from './menu-pane'
import { Dispatcher } from '../../lib/dispatcher'

interface IAppMenuProps {
  readonly menu: Electron.Menu
  readonly selection: ReadonlyArray<Electron.MenuItem>
  readonly dispatcher: Dispatcher
}

export class AppMenu extends React.Component<IAppMenuProps, void> {

  private onItemClicked = (depth: number, item: Electron.MenuItem) => {

  }

  private onSelectionChanged = (depth: number, item: Electron.MenuItem) => {
    const curSelection = this.props.selection
    const newSelection: Electron.MenuItem[] = curSelection.slice(0, depth)

    newSelection.push(item)

    this.props.dispatcher.setAppMenuSelection(newSelection)
  }

  private renderMenuPane(depth: number, menu: Electron.Menu, selectedItem?: Electron.MenuItem): JSX.Element {
    return (
      <MenuPane
        key={depth}
        depth={depth}
        items={menu.items}
        onItemClicked={this.onItemClicked}
        onSelectionChanged={this.onSelectionChanged}
      />
    )
  }

  public render() {

    const panes: JSX.Element[] = [ ]
    let parentMenu: Electron.Menu | null = this.props.menu
    let depth = 0

    const selection = this.props.selection

    for (const selectedItem of selection) {
      panes.push(this.renderMenuPane(depth++, parentMenu, selectedItem))
      const submenu = selectedItem.submenu as Electron.Menu
      if (!submenu || !submenu.items) {
        parentMenu = null
        break
      } else {
        parentMenu = submenu
      }
    }

    if (parentMenu != null) {
      panes.push(this.renderMenuPane(depth++, parentMenu))
    }

    return (
      <div id='app-menu-foldout'>
        {panes}
      </div>
    )
  }
}
