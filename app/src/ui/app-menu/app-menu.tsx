import * as React from 'react'
import { MenuPane } from './menu-pane'
import { Dispatcher } from '../../lib/dispatcher'
import { IMenuWithSelection } from '../../lib/app-state'

interface IAppMenuProps {
  readonly state: ReadonlyArray<IMenuWithSelection>
  readonly dispatcher: Dispatcher
}

export class AppMenu extends React.Component<IAppMenuProps, void> {

  private expandCollapseTimer: number | null = null

  private onItemClicked = (depth: number, item: Electron.MenuItem) => {

  }

  private onItemKeyDown = (depth: number, item: Electron.MenuItem, event: React.KeyboardEvent<any>) => {

  }

  private expandSubmenu = (depth: number, item: Electron.MenuItem) => {
    const currentState = this.props.state
    const newState = currentState.slice(0, depth + 1)

    newState.push({
      menu: item.submenu as Electron.Menu,
      parentItem: item,
    })

    this.props.dispatcher.setAppMenuState(newState)
  }

  private clearExpandCollapseTimer() {
    if (this.expandCollapseTimer) {
      window.clearTimeout(this.expandCollapseTimer)
      this.expandCollapseTimer = null
    }
  }

  private scheduleExpand(depth: number, item: Electron.MenuItem) {
    this.clearExpandCollapseTimer()
    this.expandCollapseTimer = window.setTimeout(() => {
      this.expandSubmenu(depth, item)
    }, 500)
  }

  private scheduleCollapse(depth: number) {
    this.clearExpandCollapseTimer()
    this.expandCollapseTimer = window.setTimeout(() => {
      const currentState = this.props.state
      const newState = currentState.slice(0, depth + 1)

      this.props.dispatcher.setAppMenuState(newState)
    }, 500)
  }

  private onSelectionChanged = (depth: number, item: Electron.MenuItem) => {
    this.clearExpandCollapseTimer()

    // Create a copy of the current state
    const newState = this.props.state.slice()

    // Update the currently active menu with the newly selected item
    newState[depth] = Object.assign({}, newState[depth], { selectedItem: item })

    // If the newly selected item is a submenu we'll wait a bit and then expand
    // it unless the user makes another selection in between. If it's not then
    // we'll make sure to collapse any open menu below this level.
    if (item.type === 'submenu') {
      this.scheduleExpand(depth, item)
    } else {
      this.scheduleCollapse(depth)
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
        onItemKeyDown={this.onItemKeyDown}
        onSelectionChanged={this.onSelectionChanged}
        selectedItem={menu.selectedItem}
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
