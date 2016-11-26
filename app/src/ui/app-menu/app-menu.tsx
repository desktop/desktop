import * as React from 'react'
import { MenuPane } from './menu-pane'
import { Dispatcher } from '../../lib/dispatcher'
import { IMenuWithSelection } from '../../lib/app-state'

interface IAppMenuProps {
  readonly state: ReadonlyArray<IMenuWithSelection>
  readonly dispatcher: Dispatcher
}

export class AppMenu extends React.Component<IAppMenuProps, void> {

  private onItemClicked = (depth: number, item: Electron.MenuItem) => {

  }

  private onSelectionChanged = (depth: number, item: Electron.MenuItem) => {
    // Create a copy of the current state
    const newState = this.props.state.slice(0, depth + 1)

    // Update the currently active menu with the newly selected item
    newState[depth] = Object.assign({}, newState[depth], { selectedItem: item })

    // If the newly selected item is a submenu we'll wait a bit and then expand
    // it unless the user makes another selection in between. If it's not then
    // we'll make sure to collapse any open menu below this level.
    if (item.type === 'submenu') {
      newState.push({
        menu: item.submenu as Electron.Menu,
        parentItem: item,
      })
    }

    // All submenus below the active menu should have their selection cleared
    for (let i = depth + 1; i < newState.length; i++) {
      newState[i] =  Object.assign({}, newState[i], { selectedItem: undefined })
    }

    // Ensure that the path that lead us to the currently selected menu is
    // selected. i.e. all menus above the currently active menu should have
    // their selection reset to point to the currently active menu.
    for (let i = depth - 1; i >= 0; i--) {
      newState[i] =  Object.assign({}, newState[i], { selectedItem: newState[i + 1].parentItem })
    }

    this.props.dispatcher.setAppMenuState(newState)
  }

  private renderMenuPane(depth: number, menu: IMenuWithSelection): JSX.Element {
    return (
      <MenuPane
        key={depth}
        depth={depth}
        menu={menu.menu}
        onItemClicked={this.onItemClicked}
        onSelectionChanged={this.onSelectionChanged}
        selectedItem={menu.selectedItem}
        parentItem={menu.parentItem}
      />
    )
  }

  public render() {

    const panes: JSX.Element[] = [ ]
    let depth = 0

    for (const menuWithSelection of this.props.state) {
      panes.push(this.renderMenuPane(depth++, menuWithSelection))
    }

    return (
      <div id='app-menu-foldout'>
        {panes}
      </div>
    )
  }
}
