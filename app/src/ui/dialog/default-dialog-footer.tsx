import * as React from 'react'
import { OkCancelButtonGroup } from './ok-cancel-button-group'
import { DialogFooter } from './footer'

interface IDefaultDialogFooterProps {
  readonly buttonText?: string
  readonly onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void
  readonly buttonTitle?: string
}

export class DefaultDialogFooter extends React.Component<
  IDefaultDialogFooterProps,
  {}
> {
  public render() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={this.props.buttonText || 'Close'}
          okButtonTitle={this.props.buttonTitle}
          onOkButtonClick={this.props.onButtonClick}
          cancelButtonVisible={false}
        />
      </DialogFooter>
    )
  }
}
