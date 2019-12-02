import * as React from 'react'
import { OkCancelButtonGroup } from './ok-cancel-button-group'
import { DialogFooter } from './footer'

interface IDefaultDialogFooterProps {
  /** An optional text/label for the submit button, defaults to "Close" */
  readonly buttonText?: string

  /**
   * An optional event handler for when the submit button is clicked (either
   * explicitly or as the result of a form keyboard submission). If specified
   * the consumer is responsible for preventing the default behavior which
   * is to submit the form (and thereby triggering the Dialog's submit event)
   */
  readonly onButtonClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /** An optional title (i.e. tooltip) for the submit button, defaults to none */
  readonly buttonTitle?: string

  /** Whether the submit button will be disabled or not, defaults to false */
  readonly disabled?: boolean
}

/**
 * A component which renders a default footer in a Dialog.
 *
 * A default footer consists of a single submit button inside
 * of a button group which triggers the onSubmit event on the
 * dialog when clicked.
 */
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
          okButtonDisabled={this.props.disabled}
          cancelButtonVisible={false}
        />
      </DialogFooter>
    )
  }
}
