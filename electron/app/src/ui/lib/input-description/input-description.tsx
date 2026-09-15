import * as React from 'react'
import { Octicon } from '../../octicons'
import * as octicons from '../../octicons/octicons.generated'
import classNames from 'classnames'
import { AriaLiveContainer } from '../../accessibility/aria-live-container'
import { assertNever } from '../../../lib/fatal-error'

export enum InputDescriptionType {
  Caption,
  Warning,
  Error,
}

export interface IBaseInputDescriptionProps {
  /** The ID for description. This ID needs be linked to the associated input
   * using the `aria-describedby` attribute for screen reader users. */
  readonly id: string

  /**
   * There is a common pattern that we may need to announce a message in
   * response to user input. Unfortunately, aria-live announcements are
   * interrupted by continued user input. We can force a rereading of a message
   * by appending an invisible character when the user finishes their input.
   *
   * This prop allows us to pass in when the user input changes. We can append
   * the invisible character to force the screen reader to read the message
   * again after each input. To prevent the message from being read too much, we
   * debounce the message.
   */
  readonly trackedUserInput?: string | boolean

  readonly ariaLiveMessage?: string

  readonly className?: string
}

export interface IInputDescriptionProps extends IBaseInputDescriptionProps {
  /** Whether the description is a caption, a warning, or an error.
   *
   * Captions are styled with a muted color and are used to provide additional information about the input.
   * Warnings are styled with a orange color with warning icon and are used to communicate that the input is valid but may have unintended consequences.
   * Errors are styled with a red color with error icon and are used to communicate that the input is invalid.
   */
  readonly inputDescriptionType: InputDescriptionType
}

/**
 * An Input description element with app-standard styles for captions, warnings,
 * and errors of inputs.
 *
 * Provide `children` elements to render as the content for the error element.
 */
export class InputDescription extends React.Component<IInputDescriptionProps> {
  private getClassName() {
    const { inputDescriptionType: type } = this.props

    switch (type) {
      case InputDescriptionType.Caption:
        return classNames(
          'input-description',
          this.props.className,
          'input-description-caption'
        )
      case InputDescriptionType.Warning:
        return classNames(
          'input-description',
          this.props.className,
          'input-description-warning'
        )
      case InputDescriptionType.Error:
        return classNames(
          'input-description',
          this.props.className,
          'input-description-error'
        )
      default:
        return assertNever(type, `Unknown input type  ${type}`)
    }
  }

  private renderIcon() {
    const { inputDescriptionType: type } = this.props

    switch (type) {
      case InputDescriptionType.Caption:
        return null
      case InputDescriptionType.Warning:
        return <Octicon symbol={octicons.alert} />
      case InputDescriptionType.Error:
        return <Octicon symbol={octicons.stop} />
      default:
        return assertNever(type, `Unknown input type  ${type}`)
    }
  }

  /** If a input is a warning or an error that is displayed in response to
   * tracked user input. We want it announced on user input debounce. */
  private renderAriaLiveContainer() {
    if (
      this.props.inputDescriptionType === InputDescriptionType.Caption ||
      this.props.trackedUserInput === undefined ||
      this.props.ariaLiveMessage === undefined
    ) {
      return null
    }

    return (
      <AriaLiveContainer
        message={this.props.ariaLiveMessage}
        trackedUserInput={this.props.trackedUserInput}
      />
    )
  }

  /** If the input is an error, and we are not announcing it based on user
   * input. We should have a role of alert so that it at least announced once.
   * This may be true if the error is displayed in response to a form submission.
   * */
  private getRole() {
    if (
      this.props.inputDescriptionType === InputDescriptionType.Error &&
      this.props.trackedUserInput === undefined
    ) {
      return 'alert'
    }

    return undefined
  }

  public render() {
    return (
      <>
        <div
          id={this.props.id}
          className={this.getClassName()}
          role={this.getRole()}
        >
          {this.renderIcon()}
          <div className="input-description-content">{this.props.children}</div>
        </div>
        {this.renderAriaLiveContainer()}
      </>
    )
  }
}
