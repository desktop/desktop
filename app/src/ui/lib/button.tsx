import * as React from 'react'
import * as classNames from 'classnames'

export interface IButtonProps {
  /**
   * A callback which is invoked when the button is clicked
   * using a pointer device or keyboard. The source event is
   * passed along and can be used to prevent the default action
   * or stop the even from bubbling.
   */
  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when the user moves over the button with
   * a pointer device.
   */
  readonly onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /** An optional tooltip to render when hovering over the button */
  readonly tooltip?: string

  /** Is the button disabled? */
  readonly disabled?: boolean

  /** Whether the button is a submit. */
  readonly type?: 'submit'

  /** CSS class names */
  readonly className?: string

  /** The type of button size, e.g., normal or small. */
  readonly size?: 'normal' | 'small'

  /**
   * The `ref` for the underlying <button> element.
   *
   * Ideally this would be named `ref`, but TypeScript seems to special-case its
   * handling of the `ref` type into some ungodly monstrosity. Hopefully someday
   * this will be unnecessary.
   */
  readonly onButtonRef?: (instance: HTMLButtonElement | null) => void

  /**
   * The tab index of the button element.
   *
   * A value of 'undefined' means that whether or not the element participates
   * in sequential keyboard navigation is left to the user agent's default
   * settings.
   *
   * A negative value means that the element can receive focus but not
   * through sequential keyboard navigation (i.e. only via programmatic
   * focus)
   *
   * A value of zero means that the element can receive focus through
   * sequential keyboard navigation and that the order should be determined
   * by the element's position in the DOM.
   *
   * A positive value means that the element can receive focus through
   * sequential keyboard navigation and that it should have the explicit
   * order provided and not have it be determined by its position in the DOM.
   *
   * Note: A positive value should be avoided if at all possible as it's
   * detrimental to accessibility in most scenarios.
   */
  readonly tabIndex?: number

  readonly role?: string
  readonly ariaExpanded?: boolean
  readonly ariaHasPopup?: boolean
}

/**
 * A button component.
 *
 * Provide `children` elements to represent the title of the button.
 */
export class Button extends React.Component<IButtonProps, {}> {
  private innerButton: HTMLButtonElement | null = null

  private onButtonRef = (button: HTMLButtonElement | null) => {
    this.innerButton = button

    if (this.props.onButtonRef) {
      this.props.onButtonRef(button)
    }
  }

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focus = () => {
    if (this.innerButton) {
      this.innerButton.focus()
    }
  }

  /**
   * Programmatically remove keyboard focus from the button element.
   */
  public blur() {
    if (this.innerButton) {
      this.innerButton.blur()
    }
  }

  /**
   * Get the client bounding box for the button element
   */
  public getBoundingClientRect = (): ClientRect | undefined => {
    return this.innerButton
      ? this.innerButton.getBoundingClientRect()
      : undefined
  }

  public render() {
    const className = classNames(
      'button-component',
      { 'small-button': this.props.size === 'small' },
      this.props.className
    )

    return (
      <button
        className={className}
        disabled={this.props.disabled}
        onClick={this.onClick}
        type={this.props.type || 'button'}
        ref={this.onButtonRef}
        tabIndex={this.props.tabIndex}
        onMouseEnter={this.props.onMouseEnter}
        title={this.props.tooltip}
        role={this.props.role}
        aria-expanded={this.props.ariaExpanded}
        aria-haspopup={this.props.ariaHasPopup}
      >
        {this.props.children}
      </button>
    )
  }

  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.type !== 'submit') {
      event.preventDefault()
    }

    if (this.props.onClick) {
      this.props.onClick(event)
    }
  }
}
