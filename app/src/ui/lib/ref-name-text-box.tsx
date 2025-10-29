import * as React from 'react'

import { sanitizedRefName } from '../../lib/sanitize-ref-name'
import { TextBox } from './text-box'
import { Ref } from './ref'
import { InputWarning } from './input-description/input-warning'
import { InputError } from './input-description/input-error'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IRefNameProps {
  /**
   * The initial value for the ref name.
   *
   * Note that updates to this prop will be ignored.
   */
  readonly initialValue?: string

  /**
   * The label of the text box.
   */
  readonly label?: string | JSX.Element

  /**
   * The aria-labelledBy attribute for the text box.
   */
  readonly ariaLabelledBy?: string

  /**
   * The aria-describedby attribute for the text box.
   */
  readonly ariaDescribedBy?: string

  /**
   * Called when the user changes the ref name.
   *
   * A sanitized value for the ref name is passed.
   */
  readonly onValueChange?: (sanitizedValue: string) => void

  /**
   * Optional verb for the warning message.
   *
   * Warning message: Will be {this.props.warningMessageVerb ?? 'saved '} as{'
   * '} <Ref>{sanitizedValue}</Ref>.
   */
  readonly warningMessageVerb?: string

  /**
   * Callback used when the component loses focus.
   *
   * A sanitized value for the ref name is passed.
   */
  readonly onBlur?: (sanitizedValue: string) => void
}

interface IRefNameState {
  readonly proposedValue: string
  readonly sanitizedValue: string
}

export class RefNameTextBox extends React.Component<
  IRefNameProps,
  IRefNameState
> {
  private textBoxRef = React.createRef<TextBox>()

  public constructor(props: IRefNameProps) {
    super(props)
    this.state = this.getStateForInitialValue(props.initialValue)
  }

  private getStateForInitialValue(initialValue?: string): IRefNameState {
    const proposedValue = initialValue || ''
    return {
      proposedValue,
      sanitizedValue: sanitizedRefName(proposedValue),
    }
  }

  public componentDidMount() {
    if (
      this.state.sanitizedValue !== this.props.initialValue &&
      this.props.onValueChange !== undefined
    ) {
      this.props.onValueChange(this.state.sanitizedValue)
    }
  }

  public componentWillReceiveProps(nextProps: IRefNameProps): void {
    if (
      nextProps.initialValue !== this.props.initialValue &&
      this.state.sanitizedValue === ''
    ) {
      this.setState(this.getStateForInitialValue(nextProps.initialValue))
    }
  }

  public render() {
    return (
      <div className="ref-name-text-box">
        <TextBox
          label={this.props.label}
          value={this.state.proposedValue}
          ref={this.textBoxRef}
          ariaLabelledBy={this.props.ariaLabelledBy}
          ariaDescribedBy={
            this.props.ariaDescribedBy +
            ` branch-name-warning` +
            ` branch-name-error`
          }
          onValueChanged={this.onValueChange}
          onBlur={this.onBlur}
        />

        {this.renderRefValueWarningError()}
      </div>
    )
  }

  /**
   * Programmatically moves keyboard focus to the inner text input element if it can be focused
   * (i.e. if it's not disabled explicitly or implicitly through for example a fieldset).
   */
  public focus() {
    if (this.textBoxRef.current !== null) {
      this.textBoxRef.current.focus()
    }
  }

  private onValueChange = (proposedValue: string) => {
    const sanitizedValue = sanitizedRefName(proposedValue)
    const previousSanitizedValue = this.state.sanitizedValue

    this.setState({ proposedValue, sanitizedValue })

    if (sanitizedValue === previousSanitizedValue) {
      return
    }

    if (this.props.onValueChange === undefined) {
      return
    }

    this.props.onValueChange(sanitizedValue)
  }

  private onBlur = (proposedValue: string) => {
    if (this.props.onBlur !== undefined) {
      // It's possible (although rare) that we receive the onBlur
      // event before the sanitized value has been committed to the
      // state so we need to use the value received from the onBlur
      // event instead of the one stored in state.
      this.props.onBlur(sanitizedRefName(proposedValue))
    }
  }

  private renderRefValueWarningError() {
    const { proposedValue, sanitizedValue } = this.state

    // Always render a container with fixed height to prevent layout shifts
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {this.shouldShowWarning() &&
          this.renderWarningContent(proposedValue, sanitizedValue)}
      </div>
    )
  }

  private shouldShowWarning(): boolean {
    const { proposedValue } = this.state

    // Always show the message when there's input to provide consistent layout
    return proposedValue.length > 0
  }
  private renderWarningContent(proposedValue: string, sanitizedValue: string) {
    // If the proposed value ends up being sanitized as
    // an empty string we show a message saying that the
    // proposed value is invalid.
    if (sanitizedValue.length === 0) {
      return (
        <InputError
          id="branch-name-error"
          className="warning-helper-text"
          trackedUserInput={proposedValue}
          ariaLiveMessage={`Error: ${proposedValue} is not a valid name.`}
        >
          <Ref>{proposedValue}</Ref> is not a valid name.
        </InputError>
      )
    }

    // Check if the name needs sanitization
    const needsSanitization = proposedValue !== sanitizedValue

    return this.renderMessage(proposedValue, sanitizedValue, needsSanitization)
  }

  private renderMessage(
    proposedValue: string,
    sanitizedValue: string,
    isWarning: boolean
  ) {
    const messageContent = this.renderMessageContent(sanitizedValue, isWarning)

    if (isWarning) {
      return (
        <InputWarning
          id="branch-name-warning"
          className="warning-helper-text"
          trackedUserInput={proposedValue}
          ariaLiveMessage={this.getWarningMessageAsString(sanitizedValue)}
        >
          <p>{messageContent}</p>
        </InputWarning>
      )
    } else {
      return (
        <div
          id="branch-name-info"
          className="input-description warning-helper-text input-description-warning"
        >
          <Octicon symbol={octicons.info} className="info-icon" />
          <div className="input-description-content">
            <p>{messageContent}</p>
          </div>
        </div>
      )
    }
  }

  private renderMessageContent(sanitizedValue: string, isWarning: boolean) {
    return (
      <>
        Will be {this.props.warningMessageVerb ?? 'created'} as{' '}
        <Ref>{sanitizedValue}</Ref>.{' '}
        {isWarning && (
          <span className="sr-only">
            Spaces and invalid characters have been replaced by hyphens.
          </span>
        )}
      </>
    )
  }

  private getWarningMessageAsString(sanitizedValue: string): string {
    return `Warning: Will be ${
      this.props.warningMessageVerb ?? 'created '
    } as ${sanitizedValue}. Spaces and invalid characters have been replaced by hyphens.`
  }
}
