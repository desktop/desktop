import * as React from 'react'
import classNames from 'classnames'
import { showContextualMenu } from '../main-process-proxy'

interface ITextAreaProps {
  /** The label for the textarea field. */
  readonly label?: string

  /** The class name for the label. */
  readonly labelClassName?: string

  /** The class name for the textarea field. */
  readonly textareaClassName?: string

  /** The placeholder for the textarea field. */
  readonly placeholder?: string

  readonly rows?: number

  /** The current value of the textarea field. */
  readonly value?: string

  /** Whether the textarea field should auto focus when mounted. */
  readonly autoFocus?: boolean

  /** Whether the textarea field is disabled. */
  readonly disabled?: boolean

  /** Called when the user changes the value in the textarea field. */
  readonly onChange?: (event: React.FormEvent<HTMLTextAreaElement>) => void

  /**
   * Called when the user changes the value in the textarea.
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
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void

  /** A callback to receive the underlying `textarea` instance. */
  readonly onTextAreaRef?: (instance: HTMLTextAreaElement | null) => void
}

/** A textarea element with app-standard styles. */
export class TextArea extends React.Component<ITextAreaProps, {}> {
  private onChange = (event: React.FormEvent<HTMLTextAreaElement>) => {
    if (this.props.onChange) {
      this.props.onChange(event)
    }

    if (this.props.onValueChanged && !event.defaultPrevented) {
      this.props.onValueChanged(event.currentTarget.value)
    }
  }
  private onContextMenu = (event: React.MouseEvent<any>) => {
    event.preventDefault()
    showContextualMenu([{ role: 'editMenu' }])
  }

  public render() {
    const className = classNames(
      'text-area-component',
      this.props.labelClassName
    )
    return (
      <label className={className}>
        {this.props.label}

        <textarea
          autoFocus={this.props.autoFocus}
          className={this.props.textareaClassName}
          disabled={this.props.disabled}
          rows={this.props.rows || 3}
          placeholder={this.props.placeholder}
          value={this.props.value}
          onChange={this.onChange}
          onKeyDown={this.props.onKeyDown}
          ref={this.props.onTextAreaRef}
          onContextMenu={this.onContextMenu}
        />
      </label>
    )
  }
}
