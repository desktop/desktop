import * as React from 'react'

import { sanitizedRefName } from '../../lib/sanitize-ref-name'
import { TextBox } from './text-box'
import { Octicon, OcticonSymbol } from '../octicons'
import { Ref } from './ref'

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
   * Whether to autofocus the input component.
   */
  readonly autoFocus?: boolean

  /**
   * Called when the user changes the ref name.
   *
   * A sanitized value for the ref name is passed.
   */
  readonly onValueChange?: (sanitizedValue: string) => void

  /**
   * Called when the user-entered ref name is not valid.
   *
   * This gives the opportunity to the caller to specify
   * a custom warning message explaining that the sanitized
   * value will be used instead.
   */
  readonly renderWarningMessage?: (
    sanitizedValue: string,
    proposedValue: string
  ) => JSX.Element | string

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
  public constructor(props: IRefNameProps) {
    super(props)

    const proposedValue = props.initialValue || ''

    this.state = {
      proposedValue: proposedValue,
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

  public render() {
    return (
      <div className="ref-name-text-box">
        <TextBox
          label={this.props.label}
          value={this.state.proposedValue}
          autoFocus={this.props.autoFocus}
          onValueChanged={this.onValueChange}
          onBlur={this.onBlur}
        />

        {this.renderRefValueWarning()}
      </div>
    )
  }

  private onValueChange = (proposedValue: string) => {
    const sanitizedValue = sanitizedRefName(proposedValue)

    this.setState({
      proposedValue,
      sanitizedValue,
    })

    // If the sanitized value didn't change we don't need to
    // call the onValue change prop.
    if (sanitizedValue === this.state.sanitizedValue) {
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
      // state so we need to check fot that condition and sanitize
      // the value ourselves if that's the case.
      const sanitizedValue =
        proposedValue === this.state.proposedValue
          ? this.state.sanitizedValue
          : sanitizedRefName(proposedValue)

      this.props.onBlur(sanitizedRefName(sanitizedValue))
    }
  }

  private renderRefValueWarning() {
    const { proposedValue, sanitizedValue } = this.state

    if (proposedValue === sanitizedValue) {
      return null
    }

    const renderWarningMessage =
      this.props.renderWarningMessage !== undefined
        ? this.props.renderWarningMessage
        : this.defaultRenderWarningMessage

    return (
      <div className="warning-helper-text">
        <Octicon symbol={OcticonSymbol.alert} />

        <p>{renderWarningMessage(sanitizedValue, proposedValue)}</p>
      </div>
    )
  }

  private defaultRenderWarningMessage(
    sanitizedValue: string,
    proposedValue: string
  ) {
    // If the proposed value ends up being sanitized as
    // an empty string we show a message saying that the
    // proposed value is invalid.
    if (sanitizedValue.length === 0) {
      return (
        <>
          <Ref>{proposedValue}</Ref> is not a valid name.
        </>
      )
    }

    return (
      <>
        Will be created as <Ref>{sanitizedValue}</Ref>.
      </>
    )
  }
}
