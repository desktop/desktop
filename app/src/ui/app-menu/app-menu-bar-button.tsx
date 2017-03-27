import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'
import { AppMenu, CloseSource } from './app-menu'
import { ToolbarDropdown } from '../toolbar'
import { Dispatcher } from '../../lib/dispatcher'

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
   * of the onDropdownStateChanged prop of the ToolbarDropdown component
   */
  readonly onClose: (menuItem: ISubmenuItem) => void

  /**
   * A function that's called when the menu item is opened by the user clicking
   * on the button while it is collapsed. This is a specialized version
   * of the onDropdownStateChanged prop of the ToolbarDropdown component
   */
  readonly onOpen: (menuItem: ISubmenuItem) => void

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
   * Consumers of this event should not act on the event if the event has
   * had its default action prevented by an earlier consumer that's called
   * the preventDefault method on the event instance.
   */
  readonly onKeyDown: (menuItem: ISubmenuItem, event: React.KeyboardEvent<HTMLDivElement>) => void

  /**
   * A function that's called when the button element receives keyboard focus.
   */
  readonly onButtonFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when the button element looses keyboard focus.
   */
  readonly onButtonBlur?: (event: React.FocusEvent<HTMLButtonElement>) => void

  readonly dispatcher: Dispatcher
}

/**
 * A button used inside of a menubar which utilizes the ToolbarDropdown component
 * in order to render the menu item as well as a foldout containing the item's
 * submenu (if open).
 */
export class AppMenuBarButton extends React.Component<IAppMenuBarButtonProps, void> {

  private innerDropDown: ToolbarDropdown | undefined = undefined

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focusButton() {
    if (this.innerDropDown) {
      this.innerDropDown.focusButton()
    }
  }

  private onButtonFocus = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (this.props.onButtonFocus) {
      this.props.onButtonFocus(event)
    }
  }

  private onButtonBlur = (event: React.FocusEvent<HTMLButtonElement>) => {
    if (this.props.onButtonBlur) {
      this.props.onButtonBlur(event)
    }
  }

  public render() {
    const openMenu = this.props.menuState.length
      ? this.props.menuState[0]
      : null

    const item = this.props.menuItem

    const dropDownState = openMenu && openMenu.id === item.id
      ? 'open'
      : 'closed'

    const disabled = !item.enabled

    return (
      <ToolbarDropdown
        ref={this.onDropDownRef}
        key={item.id}
        dropdownState={dropDownState}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.dropDownContentRenderer}
        showDisclosureArrow={false}
        onMouseEnter={this.onMouseEnter}
        onKeyDown={this.onKeyDown}
        disabled={disabled}
        tabIndex={-1}
        onButtonFocus={this.onButtonFocus}
        onButtonBlur={this.onButtonBlur}
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

  private onDropDownRef = (dropdown: ToolbarDropdown | undefined) => {
    this.innerDropDown = dropdown
  }

  private onMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onMouseEnter(this.props.menuItem)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    this.props.onKeyDown(this.props.menuItem, event)
  }

  private onMenuClose = (closeSource: CloseSource) => {

    // If the user closes the menu by hitting escape we explicitly move focus
    // to the button so that it's highlighted and responds to Arrow keys.
    if (closeSource.type === 'keyboard' && closeSource.event.key === 'Escape') {
      this.focusButton()
    }

    this.props.onClose(this.props.menuItem)
  }

  private onDropdownStateChanged = () => {
    const open = this.props.menuState.length > 0

    if (open) {
      this.props.onClose(this.props.menuItem)
    } else {
      this.props.onOpen(this.props.menuItem)
    }
  }

  private dropDownContentRenderer = () => {
    const menuState = this.props.menuState

    if (!menuState.length) {
      return null
    }

    return <AppMenu
      dispatcher={this.props.dispatcher}
      onClose={this.onMenuClose}
      openedWithAccessKey={this.props.openedWithAccessKey}
      state={menuState}
      enableAccessKeyNavigation={this.props.enableAccessKeyNavigation}
      autoHeight={true}
    />
  }
}
