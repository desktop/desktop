import * as React from 'react'
import * as classNames from 'classnames'

interface ITextBoxProps {
  /** The label for the input field. */
  readonly label?: string

  /** The class name for the label. */
  readonly labelClassName?: string

  /** The class name for the input field. */
  readonly inputClassName?: string

  /** The placeholder for the input field. */
  readonly placeholder?: string

  /** The current value of the input field. */
  readonly value?: string

  /** Whether the input field should be for secure entry. */
  readonly secure?: boolean

  /** Whether the input field should auto focus when mounted. */
  readonly autoFocus?: boolean

  /** Whether the input field is disabled. */
  readonly disabled?: boolean

  /** Called when the user changes the value in the input field. */
  readonly onChange?: (event: React.FormEvent<HTMLInputElement>) => void

  /** Called on key down. */
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void

  /** The type of the input. Defaults to `text`. */
  readonly type?: 'text' | 'search'
}

/** An input element with app-standard styles. */
export class TextBox extends React.Component<ITextBoxProps, void> {
  public render() {
    const className = classNames('text-box-component', this.props.labelClassName)
    const type = this.props.secure === true ? 'password' : (this.props.type || 'text')
    return (
      <label className={className}>
        {this.props.label}

        <input
          autoFocus={this.props.autoFocus}
          className={this.props.inputClassName}
          disabled={this.props.disabled}
          type={type}
          placeholder={this.props.placeholder}
          value={this.props.value}
          onChange={this.props.onChange}
          onKeyDown={this.props.onKeyDown}/>
      </label>
    )
  }
}
