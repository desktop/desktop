import * as React from 'react'
import * as classNames from 'classnames'
import { createUniqueId, releaseUniqueId } from './id-pool'
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

  /**
   * An optional text for a link label element. A link label is, for the purposes
   * of this control an anchor element that's rendered alongside (ie on the same)
   * row as the the label element. 
   * 
   * Note that the link label will only be rendered if the textbox has a
   * label text (specified through the label prop). A link label is used for
   * presenting the user with a contextual link related to a specific text
   * input such as a password recovery link for a password text box.
   */
  readonly labelLinkText?: string

  /**
   * An optional URL to be opened when the label link (if present, see the
   * labelLinkText prop for more details) is clicked. The link will be opened using the
   * standard semantics of a LinkButton, i.e. in the configured system browser.
   *
   * If not specified consumers need to subscribe to the onLabelLinkClick event.
   */
  readonly labelLinkUri?: string

  /**
   * An optional event handler which is invoked when the label link (if present,
   * see the labelLinkText prop for more details) is clicked. See the onClick
   * event on the LinkButton component for more details.
   */
  readonly onLabelLinkClick?: () => void

  /** The tab index of the input element. */
  readonly tabIndex?: number
}

interface ITextBoxState {
  /**
   * An automatically generated id for the input element used to reference
   * it from the label element. This is generated once via the id pool when the
   * component is mounted and then released once the component unmounts.
   */
  readonly inputId?: string
}

/** An input element with app-standard styles. */
export class TextBox extends React.Component<ITextBoxProps, ITextBoxState> {
  public componentWillMount() {
    const friendlyName = this.props.label || this.props.placeholder
    const inputId = createUniqueId(`TextBox_${friendlyName}`)

    this.setState({ inputId })
  }

  public componentWillUnmount() {
    if (this.state.inputId) {
      releaseUniqueId(this.state.inputId)
    }
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
        className="link-label"
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
      <div className="label-container">
        <label htmlFor={this.state.inputId}>
          {this.props.label}
        </label>
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
          ref={this.props.onInputRef}
          tabIndex={this.props.tabIndex}
        />
      </div>
    )
  }
}
