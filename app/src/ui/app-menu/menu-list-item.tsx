import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { MenuItem } from '../../models/app-menu'

interface IMenuListItemProps {
  readonly item: MenuItem
}

export class MenuListItem extends React.Component<IMenuListItemProps, void> {

  public render() {
    const item = this.props.item

    if (item.type === 'separator') {
      return null
    }

    const arrow = item.type === 'submenuItem'
      ? <Octicon className='submenu-arrow' symbol={OcticonSymbol.triangleRight} />
      : null

    return (
      <div className='menu-item'>
        <div className='label'>{item.label}</div>
        {arrow}
      </div>
    )
  }
}
