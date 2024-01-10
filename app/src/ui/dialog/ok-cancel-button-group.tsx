import * as React from 'react'
import classNames from 'classnames'
import { Button } from '../lib/button'

interface IOkCancelButtonGroupProps {
  /**
   * An optional className to be applied to the rendered div element.
   */
  readonly className?: string

  /**
   * Does the affirmative (Ok) button perform a destructive action? This controls
   * whether the Ok button, or the Cancel button will be the default button,
   * defaults to false.
   */
  readonly destructive?: boolean

  /** An optional text/label for the Ok button, defaults to "Ok" */
  readonly okButtonText?: string | JSX.Element

  /** An optional title (i.e. tooltip) for the Ok button, defaults to none */
  readonly okButtonTitle?: string

  /** Aria description of the ok button */
  readonly okButtonAriaDescribedBy?: string

  /**
   * An optional event handler for when the Ok button is clicked (either
   * explicitly or as the result of a form keyboard submission). If specified
   * the consumer is responsible for preventing the default behavior which
   * is to submit the form (and thereby triggering the Dialog's submit event)
   */
  readonly onOkButtonClick?: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void

  /** Whether the Ok button will be disabled or not, defaults to false */
  readonly okButtonDisabled?: boolean

  /** An optional text/label for the Cancel button, defaults to "Cancel" */
  readonly cancelButtonText?: string | JSX.Element

  /** An optional title (i.e. tooltip) for the Cancel button, defaults to none */
  readonly cancelButtonTitle?: string

  /**
   * Whether or not the cancel button should be rendered. The intention
   * behind this property is to enable the DefaultDialogFooter component
   * to reuse the layout of the OkCancelButtonGroup. This property was
   * not intended to be used directly by generic consumers of this component.
   * Note that use of this renders the destructive prop inoperable.
   *
   * Defaults to true
   */
  readonly cancelButtonVisible?: boolean

  /**
   * An optional event handler for when the Cancel button is clicked (either
   * explicitly or as the result of a form keyboard submission). If specified
   * the consumer is responsible for preventing the default behavior which
   * is to reset the form (and thereby triggering the Dialog's cancel event)
   */
  readonly onCancelButtonClick?: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void

  /** Whether the Cancel button will be disabled or not, defaults to false */
  readonly cancelButtonDisabled?: boolean
}

/**
 * A component for rendering Ok and Cancel buttons in
 * a dialog in the platform specific order.
 *
 * Ie, on Windows we expect the button order to be Ok, Cancel
 * whereas on Mac we expect it to be Cancel, Ok.
 *
 * See https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/
 *
 * For the purposes of this component Ok and Cancel are
 * abstract concepts indicating an affirmative answer to a
 * question posed by a dialog or a dismissal of the dialog.
 * The actual labels for the buttons can be customized to
 * fit the dialog contents.
 *
 * This component also takes care of selecting the appropriate
 * default button depending on whether an affirmative answer
 * from the user would result in a destructive action or not.
 */
export class OkCancelButtonGroup extends React.Component<
  IOkCancelButtonGroupProps,
  {}
> {
  private onOkButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onOkButtonClick !== undefined) {
      this.props.onOkButtonClick(event)
    }

    if (event.defaultPrevented) {
      return
    }

    // If the button group is destructive the Ok button will be regular
    // button as opposed to a submit button and the cancel button will
    // be a submit button. The reason for this is that we want the default
    // button to be the safest choice and we want that safe button to be
    // what gets clicked if the user submits the form using the keyboard.
    //
    // The dialog component, however, will always treat a form submission
    // as the "affirmative"/Ok action and a form reset as the cancel action
    // so we flip the event we actually send to the dialog here.
    if (this.props.destructive === true) {
      event.preventDefault()
      if (event.currentTarget.form) {
        // https://stackoverflow.com/a/12820780/2114
        event.currentTarget.form.dispatchEvent(new Event('submit'))
      }
    }
  }

  private onCancelButtonClick = (
    event: React.MouseEvent<HTMLButtonElement>
  ) => {
    if (this.props.onCancelButtonClick !== undefined) {
      this.props.onCancelButtonClick(event)
    }

    if (event.defaultPrevented) {
      return
    }

    // If the button group is destructive the Cancel button will the submit
    // button and the Ok button will be a regular button. See the
    // explanation for this in onOkButtonClick
    if (this.props.destructive === true) {
      event.preventDefault()
      if (event.currentTarget.form) {
        // https://stackoverflow.com/a/12820780/2114
        event.currentTarget.form.dispatchEvent(new Event('reset'))
      }
    }
  }

  private renderOkButton() {
    return (
      <Button
        onClick={this.onOkButtonClick}
        disabled={this.props.okButtonDisabled}
        tooltip={this.props.okButtonTitle}
        type={this.props.destructive === true ? 'button' : 'submit'}
        ariaDescribedBy={this.props.okButtonAriaDescribedBy}
      >
        {this.props.okButtonText || 'Ok'}
      </Button>
    )
  }

  private renderCancelButton() {
    if (this.props.cancelButtonVisible === false) {
      return null
    }

    return (
      <Button
        onClick={this.onCancelButtonClick}
        disabled={this.props.cancelButtonDisabled}
        tooltip={this.props.cancelButtonTitle}
        type={this.props.destructive === true ? 'submit' : 'reset'}
      >
        {this.props.cancelButtonText || 'Cancel'}
      </Button>
    )
  }

  private renderButtons() {
    // See https://www.nngroup.com/articles/ok-cancel-or-cancel-ok/
    if (__DARWIN__) {
      return (
        <>
          {this.renderCancelButton()}
          {this.renderOkButton()}
        </>
      )
    } else {
      return (
        <>
          {this.renderOkButton()}
          {this.renderCancelButton()}
        </>
      )
    }
  }

  public render() {
    const className = classNames('button-group', this.props.className, {
      destructive: this.props.destructive === true,
    })

    return (
      <div className={className}>
        {this.renderButtons()}
        {this.props.children}
      </div>
    )
  }
}
