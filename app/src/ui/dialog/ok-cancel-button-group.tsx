import * as React from 'react'
import * as classNames from 'classnames'
import { Button } from '../lib/button'

interface IOkCancelButtonGroupProps {
  /**
   * An optional className to be applied to the rendered div element.
   */
  readonly className?: string

  /**
   * Does affirmitive (Ok) button perform a destructive action? This controls
   * whether the Ok button, or the Cancel button will be the default button.
   */
  readonly destructive?: boolean

  readonly okButtonText?: string
  readonly okButtonTitle?: string
  readonly onOkButtonClick?: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
  readonly okButtonDisabled?: boolean

  readonly cancelButtonText?: string
  readonly cancelButtonTitle?: string
  readonly onCancelButtonClick?: (
    event: React.MouseEvent<HTMLButtonElement>
  ) => void
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
 * abstract concepts indicating an affirmitive or dissenting
 * answer to a question posed by a dialog. The actual labels
 * for the buttons can be customized to fit the dialog contents.
 *
 * This component also takes care of selecting the appropriate
 * default button depending on whether an affirmitive answer
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
      >
        {this.props.okButtonText || 'Ok'}
      </Button>
    )
  }

  private renderCancelButton() {
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
