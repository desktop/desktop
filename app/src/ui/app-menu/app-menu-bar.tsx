import * as React from 'react'
import {
  IMenu,
  ISubmenuItem,
  findItemByAccessKey,
  itemIsSelectable,
} from '../../models/app-menu'
import { AppMenuBarButton } from './app-menu-bar-button'
import { Dispatcher } from '../dispatcher'
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
   * An optional function that's called when the menubar loses focus.
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
    return { menuItems: [] }
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
export class AppMenuBar extends React.Component<
  IAppMenuBarProps,
  IAppMenuBarState
> {
  private menuBar: HTMLDivElement | null = null
  private readonly menuButtonRefsByMenuItemId: {
    [id: string]: AppMenuBarButton
  } = {}
  private focusOutTimeout: number | null = null

  /**
   * Whether or not keyboard focus currently lies within the MenuBar component
   */
  private hasFocus: boolean = false

  /**
   * Whenever the MenuBar component receives focus it attempts to store the
   * element which had focus prior to the component receiving it. We do so in
   * order to be able to restore focus to that element when we decide to
   * _programmatically_ give up our focus.
   *
   * A good example of this is when the user is focused on a text box and hits
   * the Alt key. Focus will then move to the first menu item in the menu bar.
   * If the user then hits Enter we relinquish our focus and return it back to
   * the text box again.
   *
   * As long as we hold on to this reference we might be preventing GC from
   * collecting a potentially huge subtree of the DOM so we need to make sure
   * to clear it out as soon as we're done with it.
   */
  private stolenFocusElement: HTMLElement | null = null

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
      // The foldout was just closed and we still have focus, time to
      // give it back to whoever had it before or remove focus entirely.
      this.restoreFocusOrBlur()
    }
  }

  public componentDidMount() {
    if (this.props.foldoutState) {
      if (this.props.appMenu.length === 1) {
        this.focusFirstMenuItem()
      }
    }
  }

  public componentWillUnmount() {
    if (this.hasFocus) {
      this.restoreFocusOrBlur()
    }
    // This is perhaps being overly cautious but just in case we're unmounted
    // and someone else is still holding a reference to us we want to make sure
    // that we're not preventing GC from doing its job.
    this.stolenFocusElement = null
  }

  public render() {
    return (
      <div
        id="app-menu-bar"
        ref={this.onMenuBarRef}
        role="menubar"
        aria-label="Application menu"
      >
        {this.state.menuItems.map(this.renderMenuItem, this)}
      </div>
    )
  }

  private isMenuItemOpen(item: ISubmenuItem) {
    const openMenu =
      this.props.foldoutState && this.props.appMenu.length > 1
        ? this.props.appMenu[1]
        : null

    return openMenu !== null && openMenu.id === item.id
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

    if (firstMenuItem) {
      this.focusMenuItem(firstMenuItem)
    }
  }

  private focusMenuItem(item: ISubmenuItem) {
    const itemComponent = this.menuButtonRefsByMenuItemId[item.id]

    if (itemComponent) {
      itemComponent.focusButton()
    }
  }

  private restoreFocusOrBlur() {
    if (!this.hasFocus) {
      return
    }

    // Us having a reference to the previously focused element doesn't
    // necessarily mean that that element is still in the DOM so we explicitly
    // check to see if it is before we yield focus to it.
    if (this.stolenFocusElement && document.contains(this.stolenFocusElement)) {
      this.stolenFocusElement.focus()
    } else if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur()
    }

    // Don't want to hold on to this a moment longer than necessary.
    this.stolenFocusElement = null
  }

  private onMenuBarFocusIn = (event: Event) => {
    const focusEvent = event as FocusEvent
    if (!this.hasFocus) {
      if (
        focusEvent.relatedTarget &&
        focusEvent.relatedTarget instanceof HTMLElement
      ) {
        this.stolenFocusElement = focusEvent.relatedTarget
      } else {
        this.stolenFocusElement = null
      }
      this.hasFocus = true
    }
    this.clearFocusOutTimeout()
  }

  private onMenuBarFocusOut = (event: Event) => {
    // When keyboard focus moves from one descendant within the
    // menu bar to another we will receive one 'focusout' event
    // followed quickly by a 'focusin' event. As such we
    // can't tell whether we've lost focus until we're certain
    // that we've only gotten the 'focusout' event.
    //
    // In order to achieve this we schedule our call to onLostFocusWithin
    // and clear that timeout if we receive a 'focusin' event.
    this.clearFocusOutTimeout()
    this.focusOutTimeout = requestAnimationFrame(this.onLostFocusWithin)
  }

  private clearFocusOutTimeout() {
    if (this.focusOutTimeout !== null) {
      cancelAnimationFrame(this.focusOutTimeout)
      this.focusOutTimeout = null
    }
  }

  private onLostFocusWithin = () => {
    this.hasFocus = false
    this.focusOutTimeout = null

    if (this.props.onLostFocus) {
      this.props.onLostFocus()
    }

    // It's possible that the element which we are referencing here is no longer
    // part of the DOM so it's important that we clear out our handle to prevent
    // us from hanging on to a possibly huge DOM structure and preventing GC
    // from collecting it. My kingdom for a weak reference.
    this.stolenFocusElement = null
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

  private onMenuClose = (
    item: ISubmenuItem,
    source: 'keyboard' | 'pointer' | 'item-executed'
  ) => {
    if (source === 'pointer' || source === 'item-executed') {
      this.restoreFocusOrBlur()
    }

    this.props.dispatcher.setAppMenuState(m => m.withClosedMenu(item.menu))
  }

  private onMenuOpen = (item: ISubmenuItem, selectFirstItem?: boolean) => {
    const enableAccessKeyNavigation = this.props.foldoutState
      ? this.props.foldoutState.enableAccessKeyNavigation
      : false

    this.props.dispatcher.showFoldout({
      type: FoldoutType.AppMenu,
      enableAccessKeyNavigation,
    })
    this.props.dispatcher.setAppMenuState(m =>
      m.withOpenedMenu(item, selectFirstItem)
    )
  }

  private onMenuButtonMouseEnter = (item: ISubmenuItem) => {
    if (this.hasFocus) {
      this.focusMenuItem(item)
    }

    if (this.props.appMenu.length > 1) {
      this.props.dispatcher.setAppMenuState(m => m.withOpenedMenu(item))
    }
  }

  private moveToAdjacentMenu(
    direction: 'next' | 'previous',
    sourceItem: ISubmenuItem
  ) {
    const rootItems = this.state.menuItems
    const menuItemIx = rootItems.findIndex(item => item.id === sourceItem.id)

    if (menuItemIx === -1) {
      return
    }

    const delta = direction === 'next' ? 1 : -1

    // http://javascript.about.com/od/problemsolving/a/modulobug.htm
    const nextMenuItemIx =
      (menuItemIx + delta + rootItems.length) % rootItems.length
    const nextItem = rootItems[nextMenuItemIx]

    if (!nextItem) {
      return
    }

    const foldoutState = this.props.foldoutState

    // Determine whether a top-level application menu is currently
    // open and use that if, and only if, the application menu foldout
    // is active.
    const openMenu = foldoutState !== null && this.props.appMenu.length > 1

    if (openMenu) {
      this.props.dispatcher.setAppMenuState(m =>
        m.withOpenedMenu(nextItem, true)
      )
    } else {
      const nextButton = this.menuButtonRefsByMenuItemId[nextItem.id]

      if (nextButton) {
        nextButton.focusButton()
      }
    }
  }

  private onMenuButtonKeyDown = (
    item: ISubmenuItem,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => {
    if (event.defaultPrevented) {
      return
    }

    const foldoutState = this.props.foldoutState

    if (!foldoutState) {
      return
    }

    if (event.key === 'Escape') {
      if (!this.isMenuItemOpen(item)) {
        this.restoreFocusOrBlur()
        event.preventDefault()
      }
    } else if (event.key === 'ArrowLeft') {
      this.moveToAdjacentMenu('previous', item)
      event.preventDefault()
    } else if (event.key === 'ArrowRight') {
      this.moveToAdjacentMenu('next', item)
      event.preventDefault()
    } else if (foldoutState.enableAccessKeyNavigation) {
      if (event.altKey || event.ctrlKey || event.metaKey) {
        return
      }

      const menuItemForAccessKey = findItemByAccessKey(
        event.key,
        this.state.menuItems
      )

      if (menuItemForAccessKey && itemIsSelectable(menuItemForAccessKey)) {
        if (menuItemForAccessKey.type === 'submenuItem') {
          this.props.dispatcher.setAppMenuState(menu =>
            menu
              .withReset()
              .withSelectedItem(menuItemForAccessKey)
              .withOpenedMenu(menuItemForAccessKey, true)
          )
        } else {
          this.restoreFocusOrBlur()
          this.props.dispatcher.executeMenuItem(menuItemForAccessKey)
        }

        event.preventDefault()
      }
    }
  }

  private onMenuButtonDidMount = (
    menuItem: ISubmenuItem,
    button: AppMenuBarButton
  ) => {
    this.menuButtonRefsByMenuItemId[menuItem.id] = button
  }

  private onMenuButtonWillUnmount = (
    menuItem: ISubmenuItem,
    button: AppMenuBarButton
  ) => {
    delete this.menuButtonRefsByMenuItemId[menuItem.id]
  }

  private renderMenuItem(item: ISubmenuItem): JSX.Element {
    const foldoutState = this.props.foldoutState

    // Slice away the top menu so that each menu bar button receives
    // their menu item's menu and any open submenus.
    const menuState = this.isMenuItemOpen(item)
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
    const highlightMenuAccessKey =
      this.props.highlightAppMenuAccessKeys ||
      (!this.isMenuItemOpen(item) && enableAccessKeyNavigation)

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
        onDidMount={this.onMenuButtonDidMount}
        onWillUnmount={this.onMenuButtonWillUnmount}
      />
    )
  }
}
