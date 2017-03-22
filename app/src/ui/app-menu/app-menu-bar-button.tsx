import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'
import { AppMenu } from './app-menu'
import { ToolbarDropdown } from '../toolbar'
import { Dispatcher } from '../../lib/dispatcher'

interface IAppMenuBarButtonProps {
  readonly menuItem: ISubmenuItem
  readonly menuState: ReadonlyArray<IMenu>
  readonly enableAccessKeyNavigation: boolean
  readonly openedWithAccessKey: boolean
  readonly highlightAppMenuToolbarButton: boolean

  readonly onClose: (menuItem: ISubmenuItem) => void
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

  readonly dispatcher: Dispatcher
}

/**
 * A button used inside of a menubar which utilizes the ToolbarDropdown component
 * in order to render the menu item as well as a foldout containing the item's
 * submenu (if open).
 */
export class AppMenuBarButton extends React.Component<IAppMenuBarButtonProps, void> {
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
        key={item.id}
        dropdownState={dropDownState}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.dropDownContentRenderer}
        showDisclosureArrow={false}
        onMouseEnter={this.onMouseEnter}
        onKeyDown={this.onKeyDown}
        disabled={disabled}
      >
        <MenuListItem
          item={item}
          highlightAccessKey={this.props.highlightAppMenuToolbarButton}
          renderAcceleratorText={false}
          renderSubMenuArrow={false}
        />
      </ToolbarDropdown>
    )
  }

  private onMouseEnter = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onMouseEnter(this.props.menuItem)
  }

  private onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    this.props.onKeyDown(this.props.menuItem, event)
  }

  private onMenuClose = () => {
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
