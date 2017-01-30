import * as React from 'react'
import { Button, IButtonProps } from './button'

export class ButtonGroup extends React.Component<void, void> {
  public render() {

    const buttons = new Array<React.ReactElement<IButtonProps>>()

    React.Children.forEach(this.props.children as any, c => {
      if (typeof(c) !== 'string' && typeof(c) !== 'number') {
        if (c.type === Button) {
          buttons.push(c as React.ReactElement<IButtonProps>)
        }
      }
    })

    if (buttons.length > 1) {
      if (__DARWIN__ && buttons[0].props.type === 'submit') {
        buttons.reverse()
      } else if (__WIN32__ && buttons[buttons.length - 1].props.type === 'submit') {
        buttons.reverse()
      }
    }

    return (
      <div className='button-group'>
        {buttons}
      </div>
    )
  }
}
