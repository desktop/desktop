import * as React from 'react'
import * as classNames from 'classnames'

interface ITextAreaProps {
  /** The label for the input field. */
  readonly label?: string

  /** The class name for the label. */
  readonly labelClassName?: string

  /** The class name for the input field. */
  readonly inputClassName?: string

  /** The placeholder for the input field. */
  readonly placeholder?: string

  readonly rows?: number

  /** The current value of the input field. */
  readonly value?: string

  /** Whether the input field should auto focus when mounted. */
  readonly autoFocus?: boolean

  /** Whether the input field is disabled. */
  readonly disabled?: boolean

  /** Called when the user changes the value in the input field. */
  readonly onChange?: (event: React.FormEvent<HTMLTextAreaElement>) => void

  /** Called on key down. */
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void

  /** A callback to receive the underlying `input` instance. */
  readonly onInputRef?: (instance: HTMLTextAreaElement) => void
}

/** An input element with app-standard styles. */
export class TextArea extends React.Component<ITextAreaProps, void> {
  public render() {
    const className = classNames('text-area-component', this.props.labelClassName)
    return (
      <label className={className}>
        {this.props.label}

        <textarea
          autoFocus={this.props.autoFocus}
          className={this.props.inputClassName}
          disabled={this.props.disabled}
          rows={this.props.rows || 3}
          placeholder={this.props.placeholder}
          value={this.props.value}
          onChange={this.props.onChange}
          onKeyDown={this.props.onKeyDown}
          ref={this.props.onInputRef}/>
      </label>
    )
  }
}
