import * as React from 'react'

import { Octicon, OcticonSymbol } from '../octicons'
import { MenuItem } from '../../models/app-menu'

export interface IMenuListItemProps {
  readonly item: MenuItem
}

/**
 * Converts Electron accelerator modifiers to their platform specific
 * name or symbol.
 *
 * Example: CommandOrControl becomes either '⌘' or 'Ctrl' depending on platform.
 *
 * See https://github.com/electron/electron/blob/fb74f55/docs/api/accelerator.md
 */
function getPlatformSpecificNameOrSymbolForModifier(modifier: string): string {
  switch (modifier.toLowerCase()) {
    case 'cmdorctrl':
    case 'commandorcontrol': return __DARWIN__ ? '⌘' : 'Ctrl'

    case 'ctrl':
    case 'control': return __DARWIN__ ? '⌃' : 'Ctrl'

    case 'shift': return __DARWIN__ ? '⇧' : 'Shift'
    case 'alt': return __DARWIN__ ? '⌥' : 'Alt'

    // Mac only
    case 'cmd':
    case 'command': return '⌘'
    case 'option': return '⌥'

    // Special case space because no one would be able to see it
    case ' ': return 'Space'
  }

  // Not a known modifier, likely a normal key
  return modifier
}

/**
 * Returns a platform specific human readable version of an Electron
 * accelerator string. See getPlatformSpecificNameOrSymbolForModifier
 * for more information.
 */
export function friendlyAcceleratorText(accelerator: string): string {
  return accelerator.split('+')
    .map(getPlatformSpecificNameOrSymbolForModifier)
    .join(__DARWIN__ ? '' : '+')
}

export class MenuListItem extends React.Component<IMenuListItemProps, void> {

  public render() {
    const item = this.props.item

    if (item.type === 'separator') {
      return <hr />
    }

    const arrow = item.type === 'submenuItem'
      ? <Octicon className='submenu-arrow' symbol={OcticonSymbol.triangleRight} />
      : null

    const accelerator = item.type !== 'submenuItem' && item.accelerator
      ? <div className='accelerator'>{friendlyAcceleratorText(item.accelerator)}</div>
      : null

    return (
      <div className='menu-item'>
        <div className='label'>{item.label}</div>
        {accelerator}
        {arrow}
      </div>
    )
  }
}
