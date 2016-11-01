import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'

export type DropdownState = 'open' | 'closed'

export interface IToolbarButtonProps {
  readonly title: string,
  readonly description?: string,
  readonly icon?: OcticonSymbol,
  readonly dropdownState?: DropdownState
  readonly onClick?: () => void
}

/**
 * A general purpose toolbar button
 */
export class ToolbarButton extends React.Component<IToolbarButtonProps, void> {

  private dropdownClassNames(): string | null {
    const state = this.props.dropdownState

    if (!state) {
      return null
    } else if (state === 'open') {
      return 'dropdown open'
    } else if (state === 'closed') {
      return 'dropdown closed'
    } else {
      return assertNever(state, `Unknown dropdown state ${state}`)
    }
  }

  private dropdownIcon(state: DropdownState): OcticonSymbol {
    // @TODO: Remake triangle octicon in a 12px version,
    // right now it's scaled badly on normal dpi monitors.
    if (state === 'open') {
      return OcticonSymbol.triangleUp
    } else if (state === 'closed') {
      return OcticonSymbol.triangleDown
    } else {
      return assertNever(state, `Unknown dropdown state ${state}`)
    }
  }

  private renderDropdownArrow() {
    const state = this.props.dropdownState
    if (!state) {
      return null
    }

    return <Octicon symbol={this.dropdownIcon(state)} className='dropdownArrow' />
  }

  private onClick() {
    if (this.props.onClick) {
      this.props.onClick()
    }
  }

  public render() {
    const icon = this.props.icon
      ? <Octicon symbol={this.props.icon} className='icon' />
      : null

    const description = this.props.description
      ? <div className='description'>{this.props.description}</div>
      : null

    const className = classNames('toolbar-button', this.dropdownClassNames())

    return (
      <button className={className} onClick={(e) => this.onClick()}>
        {icon}
        <div className='text'>
          <div className='title'>{this.props.title}</div>
          {description}
        </div>
        {this.renderDropdownArrow()}
        {this.props.children}
      </button>
    )
  }
}
