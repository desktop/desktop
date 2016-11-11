import * as React from 'react'

interface IButtonProps {
  /** A function to call on click. */
  readonly onClick?: () => void

  /** The title of the button. */
  readonly children?: string

  /** Is the button disabled? */
  readonly disabled?: boolean

  /** Whether the button is a submit. */
  readonly type?: 'submit'

  /** CSS class names */
  readonly className?: string
}

/** A button component. */
export class Button extends React.Component<IButtonProps, void> {
  public render() {
    return (
      <button
        className={this.props.className ? this.props.className : '' }
        disabled={this.props.disabled}
        onClick={e => this.onClick(e)}
        type={this.props.type}>
        {this.props.children}
      </button>
    )
  }

  private onClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()

    const onClick = this.props.onClick
    if (onClick) {
      onClick()
    }
  }
}
