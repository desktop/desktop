import * as React from 'react'

interface IDialogFooterProps {
}

export class DialogFooter extends React.Component<IDialogFooterProps, any> {
  public render() {
    return (
      <div className='dialog-footer'>
        {this.props.children}
      </div>
    )
  }
}
