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

  /**
   * An optional function that's called when the menubar looses focus.
   * 
   * Note that this function will only be called once no descendant element
   * of the menu bar has keyboard focus. In other words this differs
   * from the traditional onBlur event.
   */
  readonly onLostFocus?: () => void
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

  private menuBar: HTMLDivElement | null = null
  private focusedButton: HTMLButtonElement | null = null
  private readonly menuButtonRefsByMenuItemId: { [id: string]: AppMenuBarButton} = { }
  private focusOutTimeout: number | null = null
  private hasFocus: boolean = false

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
  }

  public componentDidUpdate(prevProps: IAppMenuBarProps) {
    // Was the app menu foldout just opened or closed?
    if (this.props.foldoutState && !prevProps.foldoutState) {
      if (this.props.appMenu.length === 1 && !this.hasFocus) {
        // It was just opened, no menus are open and we don't have focus,
        // that's our cue to focus the first menu item so that users
        // can move move around using arrow keys.
        this.focusFirstMenuItem()
      }
    } else if (!this.props.foldoutState && prevProps.foldoutState) {
      if  (this.hasFocus) {
        // The foldout was just closed and we have focus, time to
        // let go of focus.
        this.blurCurrentlyFocusedItem()
      }
    }
  }

  public componentDidMount() {
    if (this.props.foldoutState) {
      if (this.props.appMenu.length === 1) {
        this.focusFirstMenuItem()
      }
    }
  }

  public render() {
    return (
      <div id='app-menu-bar' ref={this.onMenuBarRef}>
        {this.state.menuItems.map(this.renderMenuItem, this)}
      </div>
    )
  }

  /**
   * Move keyboard focus to the first menu item button in the
   * menu bar. This has no effect when a menu is currently open.
   */
  private focusFirstMenuItem() {

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

    if (firstMenuItemComponent) {
      firstMenuItemComponent.focusButton()
    }
  }

  /**
   * Remove keyboard focus from the currently focused menu button.
   * This has no effect if no menu button has focus.
   */
  private blurCurrentlyFocusedItem() {
    if (this.focusedButton) {
      this.focusedButton.blur()
    }
  }

  private onMenuBarFocusIn = (event: FocusEvent) => {
    if (!this.hasFocus) {
      this.hasFocus = true
    }
    this.clearFocusOutTimeout()
  }

  private onMenuBarFocusOut = (event: FocusEvent) => {
    // When keyboard focus moves from one descendant within the
    // menu bar to another we will receive one 'focusout' event
    // followed immediately by a 'focusin' event. As such we
    // can't tell whether we've lost focus until we're certain
    // that we've only gotten the 'focusout' event.
    //
    // In order to achieve this we schedule our call to onLostFocusWithin
    // and clear that timeout if we receive a 'focusin' event.
    this.clearFocusOutTimeout()
    this.focusOutTimeout = setImmediate(this.onLostFocusWithin)
  }

  private clearFocusOutTimeout() {
    if (this.focusOutTimeout !== null) {
      clearImmediate(this.focusOutTimeout)
      this.focusOutTimeout = null
    }
  }

  private onLostFocusWithin = () => {
    this.hasFocus = false
    this.focusOutTimeout = null

    if (this.props.onLostFocus) {
      this.props.onLostFocus()
    }
  }

  private onMenuBarRef = (menuBar: HTMLDivElement | null) => {
    if (this.menuBar) {
      this.menuBar.removeEventListener('focusin', this.onMenuBarFocusIn)
      this.menuBar.removeEventListener('focusout', this.onMenuBarFocusOut)
    }
    this.menuBar = menuBar

    if (this.menuBar) {
      this.menuBar.addEventListener('focusin', this.onMenuBarFocusIn)
      this.menuBar.addEventListener('focusout', this.onMenuBarFocusOut)
    }
  }

  private onButtonFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    this.focusedButton = event.currentTarget
  }

  private onButtonBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    this.focusedButton = null
  }

  private onMenuClose = (item: ISubmenuItem) => {
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

    // If told to highlight access keys we will do so. If access key navigation
    // is enabled and no menu is open we'll highlight as well. This matches
    // the behavior of Windows menus.
    const highlightMenuAccessKey = this.props.highlightAppMenuAccessKeys
      ? true
      : openMenu === null && enableAccessKeyNavigation

    return (
      <AppMenuBarButton
        key={item.id}
        dispatcher={this.props.dispatcher}
        menuItem={item}
        menuState={menuState}
        highlightMenuAccessKey={highlightMenuAccessKey}
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
