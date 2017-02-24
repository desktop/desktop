import * as React from 'react'
import * as classNames from 'classnames'

export interface IButtonProps {
  /**
   * A callback which is invoked when the button is clicked
   * using a pointer device or keyboard. The source event is
   * passed along and can be used to prevent the default action
   * or stop the even from bubbling.
   */
  readonly onClick?: (event: React.FormEvent<HTMLButtonElement>) => void

  /** The title of the button. */
  readonly children?: string

  /** Is the button disabled? */
  readonly disabled?: boolean

  /** Whether the button is a submit. */
  readonly type?: 'submit'

  /** CSS class names */
  readonly className?: string

  /**
   * The `ref` for the underlying <button> element.
   *
   * Ideally this would be named `ref`, but TypeScript seems to special-case its
   * handling of the `ref` type into some ungodly monstrosity. Hopefully someday
   * this will be unnecessary.
   */
  readonly onButtonRef?: (instance: HTMLButtonElement) => void

  /** The tab index of the button element. */
  readonly tabIndex?: number
}

/** A button component. */
export class Button extends React.Component<IButtonProps, void> {
  public render() {
    const className = classNames('button-component', this.props.className)

    return (
      <button
        className={className}
        disabled={this.props.disabled}
        onClick={this.onClick}
        type={this.props.type || 'button'}
        ref={this.props.onButtonRef}
        tabIndex={this.props.tabIndex}>
        {this.props.children}
      </button>
    )
  }

  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.type !== 'submit') {
      event.preventDefault()
    }

    const onClick = this.props.onClick
    if (onClick) {
      onClick(event)
    }
  }
}
