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

/**
 * Creates menu bar state given props. This is intentionally not
 * an instance member in order to avoid mistakenly using any other
 * input data or state than the received props.
 * 
 * The state consists of a list of top-level menu items which have
 * child menus of their own (ie submenu items).
 */
function createState(props: IAppMenuBarProps): IAppMenuBarState {
    if (!props.appMenu.length) {
      return { menuItems: [ ] }
    }

    const topLevelMenu = props.appMenu[0]
    const items = topLevelMenu.items

    const menuItems = new Array<ISubmenuItem>()

    for (const item of items) {
      if (item.type === 'submenuItem') {
        menuItems.push(item)
      }
    }

    return { menuItems }
}

/**
 * A Windows-style application menu bar which renders in the title
 * bar section of the app and utilizes foldouts for displaying interactive
 * menus.
 */
export class AppMenuBar extends React.Component<IAppMenuBarProps, IAppMenuBarState> {

  public constructor(props: IAppMenuBarProps) {
    super(props)
    this.state = createState(props)
  }

  public componentWillReceiveProps(nextProps: IAppMenuBarProps) {
    if (nextProps.appMenu !== this.props.appMenu) {
      this.setState(createState(nextProps))
    }

    // If the app menu foldout is open but...
    if (nextProps.foldoutState) {
      // ...only the root menu is open
      if (nextProps.appMenu.length <= 1) {
        // Let's make sure to close the foldout
        this.props.dispatcher.closeFoldout()
      }
    }
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

    // Determine whether a top-level application menu is currently
    // open and use that if, and only if, the application menu foldout
    // is active.
    const openMenu = foldoutState && this.props.appMenu.length > 1
      ? this.props.appMenu[1]
      : null

    // Slice away the top menu so that each menu bar button receives
    // their menu item's menu and any open submenus.
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
