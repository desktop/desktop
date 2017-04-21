import * as React from 'react'
import { Button, IButtonProps } from './button'

export class ButtonListGroup extends React.Component<void, void> {
  public render() {
    const buttons = new Array<React.ReactElement<IButtonProps>>()

    React.Children.forEach(this.props.children, c => {
      if (typeof(c) !== 'string' && typeof(c) !== 'number') {
        if (c.type === Button) {
          buttons.push(c as React.ReactElement<IButtonProps>)
        }
      }
    })

    return (
      <div className='list-group'>
      </div>
    )
  }
}
