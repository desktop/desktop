import * as React from 'react'
import { Octicon } from '../../octicons'
import * as OcticonSymbol from '../../octicons/octicons.generated'
import classNames from 'classnames'
import { AriaLiveContainer } from '../../accessibility/aria-live-container'

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
    let typeClassName = 'input-description-caption'

    if (InputDescriptionType.Warning) {
      typeClassName = 'input-description-warning'
    }

    if (InputDescriptionType.Error) {
      typeClassName = 'input-description-error'
    }

    return classNames('input-description', typeClassName)
  }

  private renderIcon() {
    if (InputDescriptionType.Error) {
      return <Octicon symbol={OcticonSymbol.stop} />
    }

    if (InputDescriptionType.Warning) {
      return <Octicon symbol={OcticonSymbol.alert} />
    }

    return null
  }

  /** If a input is a warning or an error that is displayed in response to
   * tracked user input. We want it announced on user input debounce. */
  private renderAriaLiveContainer() {
    if (
      InputDescriptionType.Caption ||
      this.props.trackedUserInput === undefined
    ) {
      return null
    }

    return (
      <AriaLiveContainer trackedUserInput={this.props.trackedUserInput}>
        {this.props.children}
      </AriaLiveContainer>
    )
  }

  /** If the input is an error, and we are not announcing it based on user
   * input. We should have a role of alert so that it at least announced once.
   * This may be true if the error is displayed in response to a form submission.
   * */
  private getRole() {
    if (
      InputDescriptionType.Error &&
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
          <div>{this.props.children}</div>
        </div>
        {this.renderAriaLiveContainer()}
      </>
    )
  }
}
