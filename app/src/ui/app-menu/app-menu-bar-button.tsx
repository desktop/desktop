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

  readonly onClose: (menuItem: ISubmenuItem) => void
  readonly onOpen: (menuItem: ISubmenuItem) => void

  readonly dispatcher: Dispatcher
}

export class AppMenuBarButton extends React.Component<IAppMenuBarButtonProps, void> {
  public render() {
    const openMenu = this.props.menuState.length
      ? this.props.menuState[0]
      : null

    const item = this.props.menuItem

    const dropDownState = openMenu && openMenu.id === item.id
      ? 'open'
      : 'closed'

    return (
      <ToolbarDropdown
        key={item.id}
        dropdownState={dropDownState}
        onDropdownStateChanged={this.onDropdownStateChanged}
        dropdownContentRenderer={this.dropDownContentRenderer}
        showDisclosureArrow={false}
      >
        <MenuListItem
          item={item}
          highlightAccessKey={this.props.enableAccessKeyNavigation}
          renderAcceleratorText={false}
          renderIcon={false}
          renderSubMenuArrow={false}
        />
      </ToolbarDropdown>
    )
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
