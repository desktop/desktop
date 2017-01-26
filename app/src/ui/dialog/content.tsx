import * as React from 'react'

interface IDialogContentProps {
}

export class DialogContent extends React.Component<IDialogContentProps, any> {

  public render() {
    return (
      <div className='dialog-content'>
        {this.props.children}
      </div>
    )
  }
}
