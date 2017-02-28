import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'
import { MenuListItem } from './menu-list-item'

interface IAppMenuBarProps {
  readonly appMenu: IMenu
}

export class AppMenuBar extends React.Component<IAppMenuBarProps, void> {
  public render() {
    const items = this.props.appMenu.items
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

  private renderMenuItem(item: ISubmenuItem): JSX.Element {
    return (
      <MenuListItem
        key={item.id}
        item={item}
        highlightAccessKey={false}
        renderAcceleratorText={false}
        renderIcon={false}
        renderSubMenuArrow={false}
      />
    )
  }
}
