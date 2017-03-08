import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { AppMenuBarButton } from './app-menu-bar-button'
import { Dispatcher } from '../../lib/dispatcher'

interface IAppMenuBarProps {
  readonly appMenu: ReadonlyArray<IMenu>
  readonly dispatcher: Dispatcher
  readonly highlightAppMenuToolbarButton: boolean
}

export class AppMenuBar extends React.Component<IAppMenuBarProps, void> {
  public render() {

    if (!this.props.appMenu.length) {
      return null
    }

    const topLevelMenu = this.props.appMenu[0]

    const items = topLevelMenu.items
    const submenuItems = new Array<ISubmenuItem>()

    for (const item of items) {
      if (item.type === 'submenuItem') {
        submenuItems.push(item)
      }
    }

    return (
      <div id='app-menu-bar'>
        {submenuItems.map(this.renderMenuItem, this)}
      </div>
    )
  }

  private onMenuClose = (item: ISubmenuItem) => {
    this.props.dispatcher.setAppMenuState(m => m.withReset())
  }

  private onMenuOpen = (item: ISubmenuItem) => {
    this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(item))
  }

  private renderMenuItem(item: ISubmenuItem): JSX.Element {

    const menuState = this.props.appMenu.slice(1)

    console.log(item.id, menuState.length)

    return (
      <AppMenuBarButton
        key={item.id}
        dispatcher={this.props.dispatcher}
        menuItem={item}
        menuState={menuState}
        enableAccessKeyNavigation={this.props.highlightAppMenuToolbarButton}
        openedWithAccessKey={false}
        onClose={this.onMenuClose}
        onOpen={this.onMenuOpen}
      />
    )
  }
}
