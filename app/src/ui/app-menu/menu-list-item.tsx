import * as React from 'react'
import * as classNames from 'classnames'

import { Octicon, OcticonSymbol } from '../octicons'
import { MenuItem } from '../../models/app-menu'

export interface IMenuListItemProps {
  readonly item: MenuItem
  readonly separatorBelow?: boolean
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

    const className = classNames(
      'menu-item',
      { 'separator' : this.props.separatorBelow }
    )

    return (
      <div className={className}>
        <div className='label'>{item.label}</div>
        {arrow}
      </div>
    )
  }
}
