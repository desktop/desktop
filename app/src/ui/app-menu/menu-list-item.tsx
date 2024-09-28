import * as React from 'react'
import classNames from 'classnames'

import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { MenuItem } from '../../models/app-menu'
import { AccessText } from '../lib/access-text'
import { getPlatformSpecificNameOrSymbolForModifier } from '../../lib/menu-item'

interface IMenuListItemProps {
  readonly item: MenuItem

  /**
   * A unique identifier for the menu item. On use is  to link it to the menu
   * for accessibility labelling.
   */
  readonly menuItemId?: string

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

  /**
   * Whether or not the menu item represented by this list item is the currently
   * selected menu item.
   */
  readonly selected: boolean

  /**
   * Whether or not this menu item should have a role applied
   */
  readonly hasNoRole?: boolean

  /** Called when the user's pointer device enter the list item */
  readonly onMouseEnter?: (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => void
  /** Called when the user's pointer device leaves the list item */
  readonly onMouseLeave?: (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  /** Called when the user's pointer device clicks on the list item */
  readonly onClick?: (
    item: MenuItem,
    event: React.MouseEvent<HTMLDivElement>
  ) => void

  /**
   * Whether the list item should steal focus when selected. Defaults to
   * false.
   */
  readonly focusOnSelection?: boolean

  readonly renderLabel?: (item: MenuItem) => JSX.Element | undefined
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
  private wrapperRef = React.createRef<HTMLDivElement>()

  private getIcon(item: MenuItem): JSX.Element | null {
    if (item.type === 'checkbox' && item.checked) {
      return <Octicon className="icon" symbol={octicons.check} />
    } else if (item.type === 'radio' && item.checked) {
      return <Octicon className="icon" symbol={octicons.dotFill} />
    }

    return null
  }

  private onMouseEnter = (event: React.MouseEvent<HTMLDivElement>) => {
    this.props.onMouseEnter?.(this.props.item, event)
  }

  private onMouseLeave = (event: React.MouseEvent<HTMLDivElement>) => {
    this.props.onMouseLeave?.(this.props.item, event)
  }

  private onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    this.props.onClick?.(this.props.item, event)
  }

  public componentDidMount() {
    if (this.props.selected && this.props.focusOnSelection) {
      this.wrapperRef.current?.focus()
    }
  }

  public componentDidUpdate(prevProps: IMenuListItemProps) {
    const { focusOnSelection, selected } = this.props
    if (focusOnSelection && selected && !prevProps.selected) {
      this.wrapperRef.current?.focus()
    }
  }

  private renderLabel() {
    const { item, renderLabel } = this.props

    if (renderLabel !== undefined) {
      return renderLabel(item)
    }

    if (item.type === 'separator') {
      return
    }

    return (
      <AccessText text={item.label} highlight={this.props.highlightAccessKey} />
    )
  }

  public render() {
    const item = this.props.item

    if (item.type === 'separator') {
      return <hr />
    }

    const arrow =
      item.type === 'submenuItem' && this.props.renderSubMenuArrow !== false ? (
        <Octicon className="submenu-arrow" symbol={octicons.triangleRight} />
      ) : null

    const accelerator =
      item.type !== 'submenuItem' &&
      item.accelerator &&
      this.props.renderAcceleratorText !== false ? (
        <div className="accelerator">
          {friendlyAcceleratorText(item.accelerator)}
        </div>
      ) : null

    const { type } = item

    const className = classNames('menu-item', {
      disabled: !item.enabled,
      checkbox: type === 'checkbox',
      radio: type === 'radio',
      checked: (type === 'checkbox' || type === 'radio') && item.checked,
      selected: this.props.selected,
    })

    const role = this.props.hasNoRole
      ? undefined
      : type === 'checkbox'
      ? 'menuitemradio'
      : 'menuitem'
    const ariaChecked = type === 'checkbox' ? item.checked : undefined

    return (
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
      <div
        id={this.props.menuItemId}
        className={className}
        onMouseEnter={this.onMouseEnter}
        onMouseLeave={this.onMouseLeave}
        onClick={this.onClick}
        ref={this.wrapperRef}
        role={role}
        tabIndex={-1}
        aria-checked={ariaChecked}
      >
        {this.getIcon(item)}
        <div className="label">{this.renderLabel()}</div>
        {accelerator}
        {arrow}
      </div>
    )
  }
}
