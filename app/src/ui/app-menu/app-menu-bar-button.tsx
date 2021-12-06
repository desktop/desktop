import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'
import { AppMenu, CloseSource } from './app-menu'
import { ToolbarDropdown } from '../toolbar'
import { Dispatcher } from '../dispatcher'

interface IAppMenuBarButtonProps {
  /**
   * The top-level menu item. Currently only submenu items can be rendered as
   * top-level menu bar buttons.
   */
  readonly menuItem: ISubmenuItem

  /**
   * A list of open menus to be rendered, each menu may have
   * a selected item. An empty array signifies that the menu
   * is not open and an array containing more than one element
   * means that there's one or more submenus open.
   */
  readonly menuState: ReadonlyArray<IMenu>

  /**
   * Whether or not the application menu was opened with the Alt key, this
   * enables access key highlighting for applicable menu items as well as
   * keyboard navigation by pressing access keys.
   */
  readonly enableAccessKeyNavigation: boolean

  /**
   * Whether the menu was opened by pressing Alt (or Alt+X where X is an
   * access key for one of the top level menu items). This is used as a
   * one-time signal to the AppMenu to use some special semantics for
   * selection and focus. Specifically it will ensure that the last opened
   * menu will receive focus.
   */
  readonly openedWithAccessKey: boolean

  /**
   * Whether or not to highlight the access key of a top-level menu
   * items (if they have one). This is normally true when the Alt-key
   * is pressed, signifying that the item is accessible by holding Alt
   * and pressing the corresponding access key. Note that this is a Windows
   * convention.
   *
   * See the highlight prop of the AccessText component for more details.
   */
  readonly highlightMenuAccessKey: boolean

  /**
   * A function that's called when the menu item is closed by the user clicking
   * on the button while it is expanded. This is a specialized version
   * of the onDropdownStateChanged prop of the ToolbarDropdown component.
   *
   * @param menuItem - The top-level menu item rendered by this menu bar button.
   * @param source   - Whether closing the menu was caused by a keyboard or
   *                   pointer interaction, or if it was closed due to an
   *                   item being activated (executed).
   */
  readonly onClose: (
    menuItem: ISubmenuItem,
    source: 'keyboard' | 'pointer' | 'item-executed'
  ) => void

  /**
   * A function that's called when the menu item is opened by the user clicking
   * on the button or pressing the down arrow key while it is collapsed.
   * This is a specialized version of the onDropdownStateChanged prop of the
   * ToolbarDropdown component.
   *
   * @param selectFirstItem - Whether or not to automatically select
   *                          the first item in the newly opened menu.
   *                          This is set when the menu is opened by the
   *                          user pressing the down arrow key while focused
   *                          on the button.
   */
  readonly onOpen: (menuItem: ISubmenuItem, selectFirstItem?: boolean) => void

  /**
   * A function that's called when the user hovers over the menu item with
   * a pointer device. Note that this only fires for mouse events inside
   * of the button and not when hovering content inside the foldout such
   * as menu items.
   */
  readonly onMouseEnter: (menuItem: ISubmenuItem) => void

  /**
   * A function that's called when a key event is received from the MenuBar
   * button component or any of its descendants. Note that this includes any
   * component or element within the foldout when that is open like, for
   * example, MenuItem components.
   *
   * This function is called before the menu bar button itself does any
   * processing of the event so consumers should make sure to call
   * event.preventDefault if they act on the event in order to make sure that
   * the menu bar button component doesn't act on the same key.
   */
  readonly onKeyDown: (
    menuItem: ISubmenuItem,
    event: React.KeyboardEvent<HTMLDivElement>
  ) => void

  /**
   * A function that's called once the component has been mounted. This, and
   * the onWillUnmount prop are essentially equivalent to the ref callback
   * except these methods pass along the menuItem so that the parent component
   * is able to keep track of them without having to resort to closing over id's
   * in its render method which would cause the component to re-render on each
   * pass.
   *
   * Note that this method is unreliable if the component can receive a new
   * MenuItem during its lifetime. As such it's important that
   * consumers on this component uses a key prop that's equal to the id of
   * the menu item such that it won't be re-used. It's also important that
   * consumers of this not rely on reference equality when tracking components
   * and instead use the id of the menuItem.
   */
  readonly onDidMount?: (
    menuItem: ISubmenuItem,
    button: AppMenuBarButton
  ) => void

  /**
   * A function that's called directly before the component unmounts. This, and
   * the onDidMount prop are essentially equivalent to the ref callback except
   * these methods pass along the menuItem so that the parent component is able
   * to keep track of them without having to resort to closing over id's in its
   * render method which would cause the component to re-render on each pass.
   *
   * Note that this method is unreliable if the component can receive a new
   * MenuItem during its lifetime. As such it's important that
   * consumers on this component uses a key prop that's equal to the id of
   * the menu item such that it won't be re-used. It's also important that
   * consumers of this not rely on reference equality when tracking components
   * and instead use the id of the menuItem.
   */
  readonly onWillUnmount?: (
    menuItem: ISubmenuItem,
    button: AppMenuBarButton
  ) => void

  readonly dispatcher: Dispatcher
}

/**
 * A button used inside of a menubar which utilizes the ToolbarDropdown component
 * in order to render the menu item as well as a foldout containing the item's
 * submenu (if open).
 */
export class AppMenuBarButton extends React.Component<
  IAppMenuBarButtonProps,
  {}
> {
  private innerDropDown: ToolbarDropdown | null = null

  /**
   * Gets a value indicating whether or not the menu of this
   * particular menu item is expanded or collapsed.
   */
  private get isMenuOpen() {
    return this.props.menuState.length !== 0
  }

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focusButton() {
    if (this.innerDropDown) {
      this.innerDropDown.focusButton()
    }
  }

  public componentDidMount() {
    if (this.props.onDidMount) {
      this.props.onDidMount(this.props.menuItem, this)
    }
  }

  public componentWillUnmount() {
    if (this.props.onWillUnmount) {
      this.props.onWillUnmount(this.props.menuItem, this)
    }
  }

  public render() {
    const item = this.props.menuItem
    const dropDownState = this.isMenuOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        ref={this.onDropDownRef}
        key={item.id}
        dropdownState={dropDownState}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.dropDownContentRenderer}
        // Disable the dropdown focus trap for menus. Items in the menus are not
        // "tabbable", so the app crashes when this prop is set to true and the
        // user opens a menu (on Windows).
        // Besides, we use a custom "focus trap" for menus anyway.
        enableFocusTrap={false}
        showDisclosureArrow={false}
        onMouseEnter={this.onMouseEnter}
        onKeyDown={this.onKeyDown}
        tabIndex={-1}
        role="menuitem"
      >
        <MenuListItem
          item={item}
          highlightAccessKey={this.props.highlightMenuAccessKey}
          renderAcceleratorText={false}
          renderSubMenuArrow={false}
        />
      </ToolbarDropdown>
    )
  }

  private onDropDownRef = (dropdown: ToolbarDropdown | null) => {
    this.innerDropDown = dropdown
  }

  private onMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onMouseEnter(this.props.menuItem)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) {
      return
    }

    this.props.onKeyDown(this.props.menuItem, event)

    if (!this.isMenuOpen && !event.defaultPrevented) {
      if (event.key === 'ArrowDown') {
        this.props.onOpen(this.props.menuItem, true)
        event.preventDefault()
      }
    }
  }

  private onMenuClose = (closeSource: CloseSource) => {
    // If the user closes the menu by hitting escape we explicitly move focus
    // to the button so that it's highlighted and responds to Arrow keys.
    if (closeSource.type === 'keyboard' && closeSource.event.key === 'Escape') {
      this.focusButton()
    }

    this.props.onClose(this.props.menuItem, closeSource.type)
  }

  private onDropdownStateChanged = (
    state: 'closed' | 'open',
    source: 'keyboard' | 'pointer'
  ) => {
    if (this.isMenuOpen) {
      this.props.onClose(this.props.menuItem, source)
    } else {
      this.props.onOpen(this.props.menuItem)
    }
  }

  private dropDownContentRenderer = () => {
    const menuState = this.props.menuState

    if (!this.isMenuOpen) {
      return null
    }

    return (
      <AppMenu
        dispatcher={this.props.dispatcher}
        onClose={this.onMenuClose}
        openedWithAccessKey={this.props.openedWithAccessKey}
        state={menuState}
        enableAccessKeyNavigation={this.props.enableAccessKeyNavigation}
        autoHeight={true}
      />
    )
  }
}
