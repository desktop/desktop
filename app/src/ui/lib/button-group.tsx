import * as React from 'react'
import { Button, IButtonProps } from './button'

interface IButtonGroupProps {
  /**
   * Does the button group perform a destructive action? On macOS, this controls
   * whether the submit button belongs on the left or right. This has no effect
   * on other OSes.
   */
  readonly destructive?: boolean
}

/**
 * A component for rendering primary and secondary buttons in
 * a dialog, form or foldout in the platform specific order.
 *
 * Ie, on Windows we expect the button order to be Ok, Cancel
 * whereas on Mac we expect it to be Cancel, Ok. This component,
 * coupled with the button-group-order tslint rule ensures that
 * we adhere to platform conventions.
 *
 * See https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/
 *
 * Non-button `children` content in this component is prohibited and will
 * not render.
 */
export class ButtonGroup extends React.Component<IButtonGroupProps, {}> {
  public render() {
    const buttons = new Array<React.ReactElement<IButtonProps>>()

    React.Children.forEach(this.props.children, c => {
      if (typeof c !== 'string' && typeof c !== 'number') {
        if (c.type === Button) {
          buttons.push(c as React.ReactElement<IButtonProps>)
        }
      }
    })

    // Flip the order of the buttons if they don't appear to be
    // in the correct order. The tslint rule button-group-order
    // _should_ ensure that it's always Ok, Cancel in markup but
    // we're a little bit more lax here.
    if (buttons.length > 1) {
      if (
        __DARWIN__ &&
        buttons[0].props.type === 'submit' &&
        this.props.destructive !== true
      ) {
        buttons.reverse()
      } else if (
        __WIN32__ &&
        buttons[buttons.length - 1].props.type === 'submit'
      ) {
        buttons.reverse()
      }
    }

    return <div className="button-group">{buttons}</div>
  }
}
