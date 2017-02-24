import * as React from 'react'
import * as classNames from 'classnames'
import { v4 as guid } from 'uuid'
import { LinkButton } from './link-button'

interface ITextBoxProps {
  /** The label for the input field. */
  readonly label?: string

  /**
   * An optional className to be applied to the rendered
   * top level element of the component.
   */
  readonly className?: string

  /** The placeholder for the input field. */
  readonly placeholder?: string

  /** The current value of the input field. */
  readonly value?: string

  /** Whether the input field should auto focus when mounted. */
  readonly autoFocus?: boolean

  /** Whether the input field is disabled. */
  readonly disabled?: boolean

  /** Called when the user changes the value in the input field. */
  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void

  /**
   * Called when the user changes the value in the input field.
   *
   * This differs from the onChange event in that it passes only the new
   * value and not the event itself. Subscribe to the onChange event if you
   * need the ability to prevent the action from occurring.
   *
   * This callback will not be invoked if the callback from onChange calls
   * preventDefault.
   */
  readonly onValueChanged?: (value: string) => void

  /** Called on key down. */
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void

  /** The type of the input. Defaults to `text`. */
  readonly type?: 'text' | 'search' | 'password'

  /** A callback to receive the underlying `input` instance. */
  readonly onInputRef?: (instance: HTMLInputElement) => void

  readonly labelLinkText?: string
  readonly labelLinkUri?: string
  readonly onLabelLinkClick?: () => void
}

interface ITextBoxState {
  readonly inputId?: string
}

/** An input element with app-standard styles. */
export class TextBox extends React.Component<ITextBoxProps, ITextBoxState> {

  public componentWillMount() {
    this.setState({ inputId: guid() })
  }

  private onChange = (event: React.FormEvent<HTMLInputElement>) => {
    if (this.props.onChange) {
      this.props.onChange(event)
    }

    if (this.props.onValueChanged && !event.defaultPrevented) {
      this.props.onValueChanged(event.currentTarget.value)
    }
  }

  private renderLabelLink() {
    if (!this.props.labelLinkText) {
      return null
    }

    return (
      <LinkButton
        uri={this.props.labelLinkUri}
        onClick={this.props.onLabelLinkClick}
        className='link-label'
      >
          {this.props.labelLinkText}
      </LinkButton>
    )
  }

  private renderLabel() {
    if (!this.props.label) {
      return null
    }

    return (
      <div className='label-container'>
        <label htmlFor={this.state.inputId}>{this.props.label}</label>
        {this.renderLabelLink()}
      </div>
    )
  }

  public render() {
    const className = classNames('text-box-component', this.props.className)

    const inputId = this.props.label ? this.state.inputId : undefined

    return (
      <div className={className}>
        {this.renderLabel()}

        <input
          id={inputId}
          autoFocus={this.props.autoFocus}
          disabled={this.props.disabled}
          type={this.props.type}
          placeholder={this.props.placeholder}
          value={this.props.value}
          onChange={this.onChange}
          onKeyDown={this.props.onKeyDown}
          ref={this.props.onInputRef}/>
      </div>
    )
  }
}
