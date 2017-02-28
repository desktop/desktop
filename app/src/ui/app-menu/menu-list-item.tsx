import * as React from 'react'
import * as classNames from 'classnames'

import { Octicon, OcticonSymbol } from '../octicons'
import { MenuItem } from '../../models/app-menu'
import { AccessText } from '../lib/access-text'

interface IMenuListItemProps {
  readonly item: MenuItem
  readonly highlightAccessKey: boolean

  readonly renderAcceleratorText?: boolean
  readonly renderIcon?: boolean
  readonly renderSubMenuArrow?: boolean
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
    case ',': return 'Comma'
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

  private getIcon(item: MenuItem): JSX.Element | null {

    if (this.props.renderIcon === false) {
      return null
    }

    if (item.type === 'checkbox' && item.checked) {
      return <Octicon className='icon' symbol={OcticonSymbol.check} />
    } else if (item.type === 'radio' && item.checked) {
      return <Octicon className='icon' symbol={OcticonSymbol.primitiveDot} />
    }

    return null
  }

  public render() {
    const item = this.props.item

    if (item.type === 'separator') {
      return <hr />
    }

    const arrow = item.type === 'submenuItem' && this.props.renderSubMenuArrow !== false
      ? <Octicon className='submenu-arrow' symbol={OcticonSymbol.triangleRight} />
      : null

    const accelerator = item.type !== 'submenuItem' && item.accelerator && this.props.renderAcceleratorText !== false
      ? <div className='accelerator'>{friendlyAcceleratorText(item.accelerator)}</div>
      : null

    const className = classNames(
      'menu-item',
      { 'disabled': !item.enabled },
      { 'checkbox': item.type === 'checkbox' },
      { 'radio': item.type === 'radio' },
      { 'checked': (item.type === 'checkbox' || item.type === 'radio') && item.checked },
    )

    return (
      <div className={className}>
        {this.getIcon(item)}
        <div className='label'>
          <AccessText text={item.label} highlight={this.props.highlightAccessKey} />
        </div>
        {accelerator}
        {arrow}
      </div>
    )
  }
}
