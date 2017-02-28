import * as React from 'react'
import { IMenu, ISubmenuItem } from '../../models/app-menu'

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

    return <ul id='app-menu-bar'>{submenuItems.map(this.renderMenuItem, this)}</ul>
  }

  private renderMenuItem(menu: ISubmenuItem): JSX.Element {
    return (
      <li key={menu.id}>
        {menu.label}
      </li>
    )
  }
}
