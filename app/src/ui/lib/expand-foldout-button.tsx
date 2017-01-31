import * as React from 'react'

import { ToggleButton } from './toggle-button'
import { Octicon, OcticonSymbol } from '../octicons'

interface IExpandFoldoutButtonProps {
  /** The function to call when the expanded state of the component changes */
  readonly onClick?: (expanded: boolean) => void

  /**
   * Indicates whether the button is in the expanded state.
   *
   * If not specified, button state defaults to false (closed).
   */
  readonly expanded?: boolean

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
        checked={this.props.expanded}>
        <Octicon className='plus' symbol={OcticonSymbol.plus} />

        <div>{this.props.children}</div>

        <div className='right-edge'>
          <Octicon className='arrow' symbol={OcticonSymbol.triangleRight} />
        </div>
      </ToggleButton>
    )
  }
}
