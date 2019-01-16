import * as React from 'react'
import * as classNames from 'classnames'

import Octicon, * as OcticonSymbol from '@githubprimer/octicons-react'
import { MenuItem } from '../../models/app-menu'
import { AccessText } from '../lib/access-text'
import { getPlatformSpecificNameOrSymbolForModifier } from '../../lib/menu-item'

interface IMenuListItemProps {
  readonly item: MenuItem

  /**
   * Whether or not to highlight the access key of a menu item (if one exists).
   *
   * See the highlight prop of AccessText component for more details.
   */
  readonly highlightAccessKey: boolean

  /**
   * Whether or not to render the accelerator (shortcut) next to the label.
   * This can be turned off when the menu item is used as a stand-alone item
   *
   * Defaults to true if not specified (i.e. undefined)
   */
  readonly renderAcceleratorText?: boolean

  /**
   * Whether or not to render an arrow to the right of the label when the
   * menu item has a submenu. This can be turned off when the menu item is
   * used as a stand-alone item or when expanding the submenu doesn't follow
   * the default conventions (i.e. expanding to the right).
   *
   * Defaults to true if not specified (i.e. undefined)
   */
  readonly renderSubMenuArrow?: boolean
}

/**
 * Returns a platform specific human readable version of an Electron
 * accelerator string. See getPlatformSpecificNameOrSymbolForModifier
 * for more information.
 */
export function friendlyAcceleratorText(accelerator: string): string {
  return accelerator
    .split('+')
    .map(getPlatformSpecificNameOrSymbolForModifier)
    .join(__DARWIN__ ? '' : '+')
}

export class MenuListItem extends React.Component<IMenuListItemProps, {}> {
  private getIcon(item: MenuItem): JSX.Element | null {
    if (item.type === 'checkbox' && item.checked) {
      return <Octicon className="icon" icon={OcticonSymbol.Check} />
    } else if (item.type === 'radio' && item.checked) {
      return <Octicon className="icon" icon={OcticonSymbol.PrimitiveDot} />
    }

    return null
  }

  public render() {
    const item = this.props.item

    if (item.type === 'separator') {
      return <hr />
    }

    const arrow =
      item.type === 'submenuItem' && this.props.renderSubMenuArrow !== false ? (
        <Octicon className="submenu-arrow" icon={OcticonSymbol.TriangleRight} />
      ) : null

    const accelerator =
      item.type !== 'submenuItem' &&
      item.accelerator &&
      this.props.renderAcceleratorText !== false ? (
        <div className="accelerator">
          {friendlyAcceleratorText(item.accelerator)}
        </div>
      ) : null

    const className = classNames(
      'menu-item',
      { disabled: !item.enabled },
      { checkbox: item.type === 'checkbox' },
      { radio: item.type === 'radio' },
      {
        checked:
          (item.type === 'checkbox' || item.type === 'radio') && item.checked,
      }
    )

    return (
      <div className={className}>
        {this.getIcon(item)}
        <div className="label">
          <AccessText
            text={item.label}
            highlight={this.props.highlightAccessKey}
          />
        </div>
        {accelerator}
        {arrow}
      </div>
    )
  }
}
