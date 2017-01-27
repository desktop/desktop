import * as React from 'react'

import { ToggleButton } from './toggle-button'
import { Octicon, OcticonSymbol } from '../octicons'

interface IExpandFoldoutButtonProps {
  /** The function to call when the open state of the component changes */
  readonly onClick?: (open: boolean) => void

  /**
   * Indicates whether the button is in the open state.
   *
   * If not specified, button state defaults to false (closed).
   */
  readonly open?: boolean

  /** The title of the button. */
  readonly children?: string
}

/** A button for expanding a section of a foldout. */
export class ExpandFoldoutButton extends React.Component<IExpandFoldoutButtonProps, void> {
  public render() {
    return (
      <ToggleButton
        className='expand-foldout-button'
        onClick={this.props.onClick}
        checked={this.props.open}>
        <div className='label'>
          <Octicon className='plus' symbol={OcticonSymbol.plus} />
          <div>{this.props.children}</div>
        </div>

        <Octicon className='arrow' symbol={OcticonSymbol.triangleRight} />
      </ToggleButton>
    )
  }
}
