import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { AppMenuBarButton } from './app-menu-bar-button'
import { Dispatcher } from '../../lib/dispatcher'
import { FoldoutType } from '../../lib/app-state'

interface IAppMenuBarProps {
  readonly appMenu: ReadonlyArray<IMenu>
  readonly dispatcher: Dispatcher
  readonly highlightAppMenuToolbarButton: boolean
  readonly foldoutState: { type: FoldoutType.AppMenu, enableAccessKeyNavigation: boolean, openedWithAccessKey?: boolean } | null
}

interface IAppMenuBarState {
  readonly menuItems: ReadonlyArray<ISubmenuItem>
}

export class AppMenuBar extends React.Component<IAppMenuBarProps, IAppMenuBarState> {

  public constructor(props: IAppMenuBarProps) {
    super(props)
    this.state = {
      menuItems: this.buildMenuItems(props.appMenu),
    }
  }

  public componentWillReceiveProps(nextProps: IAppMenuBarProps) {
    this.setState({ menuItems: this.buildMenuItems(nextProps.appMenu) })
  }

  private buildMenuItems(appMenu: ReadonlyArray<IMenu>): ReadonlyArray<ISubmenuItem> {
    if (!this.props.appMenu.length) {
      return []
    }

    const topLevelMenu = this.props.appMenu[0]
    const items = topLevelMenu.items

    const submenuItems = new Array<ISubmenuItem>()

    for (const item of items) {
      if (item.type === 'submenuItem') {
        submenuItems.push(item)
      }
    }

    return submenuItems
  }

  public render() {
    return (
      <div id='app-menu-bar'>
        {this.state.menuItems.map(this.renderMenuItem, this)}
      </div>
    )
  }

  private onMenuClose = (item: ISubmenuItem) => {
    if (this.props.foldoutState) {
      this.props.dispatcher.closeFoldout()
    }
    this.props.dispatcher.setAppMenuState(m => m.withClosedMenu(item.menu))
  }

  private onMenuOpen = (item: ISubmenuItem) => {
    const enableAccessKeyNavigation = this.props.foldoutState
      ? this.props.foldoutState.enableAccessKeyNavigation
      : false

    this.props.dispatcher.showFoldout({ type: FoldoutType.AppMenu, enableAccessKeyNavigation })
    this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(item))
  }

  private onMenuButtonMouseEnter = (item: ISubmenuItem) => {
    if (this.props.appMenu.length > 1) {
      this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(item))
    }
  }

  private moveToAdjacentMenu(direction: 'next' | 'previous', sourceItem: ISubmenuItem) {
    const rootItems = this.state.menuItems
    const menuItemIx = rootItems
      .findIndex(item => item.id === sourceItem.id)

    if (menuItemIx === -1) {
      return
    }

    const delta = direction === 'next' ? 1 : -1

    // http://javascript.about.com/od/problemsolving/a/modulobug.htm
    const nextMenuItemIx = ((menuItemIx + delta) + rootItems.length) % rootItems.length
    const nextItem = rootItems[nextMenuItemIx]

    if (!nextItem) {
      return
    }

    this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(nextItem, true))
  }

  private onMenuButtonKeyDown = (item: ISubmenuItem, event: React.KeyboardEvent<HTMLDivElement>) => {

    if (event.defaultPrevented) {
      return
    }

    if (event.key === 'ArrowLeft') {
      this.moveToAdjacentMenu('previous', item)
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      this.moveToAdjacentMenu('next', item)
      event.preventDefault()
    }
  }

  private renderMenuItem(item: ISubmenuItem): JSX.Element {

    const foldoutState = this.props.foldoutState

    const openMenu = foldoutState && this.props.appMenu.length > 1
      ? this.props.appMenu[1]
      : null

    const menuState = openMenu && openMenu.id === item.id
      ? this.props.appMenu.slice(1)
      : []

    const openedWithAccessKey = foldoutState
      ? foldoutState.openedWithAccessKey || false
      : false

      const enableAccessKeyNavigation = foldoutState
        ? foldoutState.enableAccessKeyNavigation
        : false

    return (
      <AppMenuBarButton
        key={item.id}
        dispatcher={this.props.dispatcher}
        menuItem={item}
        menuState={menuState}
        highlightAppMenuToolbarButton={this.props.highlightAppMenuToolbarButton}
        enableAccessKeyNavigation={enableAccessKeyNavigation}
        openedWithAccessKey={openedWithAccessKey}
        onClose={this.onMenuClose}
        onOpen={this.onMenuOpen}
        onMouseEnter={this.onMenuButtonMouseEnter}
        onKeyDown={this.onMenuButtonKeyDown}
      />
    )
  }
}
