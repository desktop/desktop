import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'
import { AppMenu } from './app-menu'
import { ToolbarDropdown } from '../toolbar'
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

  private onDropdownStateChanged = () => {

  }

  private dropDownContentRenderer = () => {
    const menuState = this.props.appMenu.slice(1)

    if (!menuState.length) {
      return null
    }

    return <AppMenu
      dispatcher={this.props.dispatcher}
      onClose={() => { }}
      openedWithAccessKey={false}
      state={menuState}
      enableAccessKeyNavigation={false}
    />
  }

  private renderMenuItem(item: ISubmenuItem): JSX.Element {

    const openMenu = this.props.appMenu.length > 1
      ? this.props.appMenu[1]
      : null

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
          highlightAccessKey={this.props.highlightAppMenuToolbarButton}
          renderAcceleratorText={false}
          renderIcon={false}
          renderSubMenuArrow={false}
        />
      </ToolbarDropdown>
    )
  }
}
