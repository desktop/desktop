import * as React from 'react'

interface IDialogFooterProps {
  readonly children?: ReadonlyArray<JSX.Element>
}

/**
 * A container component for footer content in a Dialog.
 * This component should only be used at most once in any given dialog and it
 * should be rendered as the last child of that dialog.
 */
export class DialogFooter extends React.Component<IDialogFooterProps, void> {
  public render() {
    return (
      <div className='dialog-footer'>
        {this.props.children}
      </div>
    )
  }
}
