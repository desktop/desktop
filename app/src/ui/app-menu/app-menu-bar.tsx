import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { AppMenuBarButton } from './app-menu-bar-button'
import { Dispatcher } from '../../lib/dispatcher'
import { AppMenuFoldout, FoldoutType } from '../../lib/app-state'

interface IAppMenuBarProps {
  readonly appMenu: ReadonlyArray<IMenu>
  readonly dispatcher: Dispatcher

  /**
   * Whether or not to highlight access keys for top-level menu items.
   * Note that this does not affect whether access keys are highlighted
   * for menu items in submenus, that's controlled by the foldoutState
   * enableAccessKeyNavigation prop and follows Windows conventions such
   * that opening a menu by clicking on it and then hitting Alt does
   * not highlight the access keys within.
   */
  readonly highlightAppMenuAccessKeys: boolean

  /**
   * The current AppMenu foldout state. If null that means that the
   * app menu foldout is not currently open.
   */
  readonly foldoutState: AppMenuFoldout | null
}

interface IAppMenuBarState {
  /**
   * A list of visible top-level menu items which have child menus of
   * their own (ie submenu items).
   */
  readonly menuItems: ReadonlyArray<ISubmenuItem>
}

/**
 * Creates menu bar state given props. This is intentionally not
 * an instance member in order to avoid mistakenly using any other
 * input data or state than the received props.
 * 
 * The state consists of a list of visible top-level menu items which have
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
      if (item.type === 'submenuItem' && item.visible) {
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

  private focusedButton: HTMLButtonElement | null = null
  private readonly menuButtonRefsByMenuItemId: { [id: string]: AppMenuBarButton} = { }

  public get menuButtonHasFocus(): boolean {
    return this.focusedButton !== null
  }

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

  /**
   * Move keyboard focus to the first menu item button in the
   * menu bar. This has no effect when a menu is currently open.
   */
  public focusFirstMenuItem() {

    // Menu currently open?
    if (this.props.appMenu.length > 1) {
      return
    }

    const rootItems = this.state.menuItems

    if (!rootItems.length) {
      return
    }

    const firstMenuItem = rootItems[0]
    const firstMenuItemComponent = this.menuButtonRefsByMenuItemId[firstMenuItem.id]

    if (!firstMenuItemComponent) {
      return
    }

    firstMenuItemComponent.focusButton()
  }

  /**
   * Remove keyboard focus from the currently focused menu button.
   * This has no effect if no menu button has focus.
   */
  public blurCurrentlyFocusedItem() {
    if (this.focusedButton) {
      this.focusedButton.blur()
    }
  }

  public render() {
    return (
      <div id='app-menu-bar'>
        {this.state.menuItems.map(this.renderMenuItem, this)}
      </div>
    )
  }

  private onButtonFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    this.focusedButton = event.currentTarget
  }

  private onButtonBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    this.focusedButton = null
  }

  private onMenuClose = (item: ISubmenuItem) => {
    if (this.props.foldoutState) {
      this.props.dispatcher.closeFoldout()
    }
    this.props.dispatcher.setAppMenuState(m => m.withClosedMenu(item.menu))
  }

  private onMenuOpen = (item: ISubmenuItem, selectFirstItem?: boolean) => {
    const enableAccessKeyNavigation = this.props.foldoutState
      ? this.props.foldoutState.enableAccessKeyNavigation
      : false

    this.props.dispatcher.showFoldout({ type: FoldoutType.AppMenu, enableAccessKeyNavigation })
    this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(item, selectFirstItem))
  }

  private onMenuButtonMouseEnter = (item: ISubmenuItem) => {
    if (this.props.appMenu.length > 1) {
      this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(item))
    }

    if (this.focusedButton) {
      this.focusedButton.blur()
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

    const foldoutState = this.props.foldoutState

    // Determine whether a top-level application menu is currently
    // open and use that if, and only if, the application menu foldout
    // is active.
    const openMenu = foldoutState && this.props.appMenu.length > 1
      ? true
      : false

    if (openMenu) {
      this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(nextItem, true))
    } else {
      const nextButton = this.menuButtonRefsByMenuItemId[nextItem.id]

      if (nextButton) {
        nextButton.focusButton()
      }
    }
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

  private onMenuButtonDidMount = (menuItem: ISubmenuItem, button: AppMenuBarButton) => {
    this.menuButtonRefsByMenuItemId[menuItem.id] = button
  }

  private onMenuButtonWillUnmount = (menuItem: ISubmenuItem, button: AppMenuBarButton) => {
    delete this.menuButtonRefsByMenuItemId[menuItem.id]
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
        highlightMenuAccessKey={this.props.highlightAppMenuAccessKeys}
        enableAccessKeyNavigation={enableAccessKeyNavigation}
        openedWithAccessKey={openedWithAccessKey}
        onClose={this.onMenuClose}
        onOpen={this.onMenuOpen}
        onMouseEnter={this.onMenuButtonMouseEnter}
        onKeyDown={this.onMenuButtonKeyDown}
        onButtonFocus={this.onButtonFocus}
        onButtonBlur={this.onButtonBlur}
        onDidMount={this.onMenuButtonDidMount}
        onWillUnmount={this.onMenuButtonWillUnmount}
      />
    )
  }
}
