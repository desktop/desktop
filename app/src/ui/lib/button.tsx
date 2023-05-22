import * as React from 'react'
import classNames from 'classnames'
import { Tooltip, TooltipDirection } from './tooltip'
import { createObservableRef } from './observable-ref'
import { AriaHasPopupType } from './aria-types'

export interface IButtonProps {
  /**
   * A callback which is invoked when the button is clicked
   * using a pointer device or keyboard. The source event is
   * passed along and can be used to prevent the default action
   * or stop the event from bubbling.
   */
  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A callback which is invoked when the button's context menu
   * is activated using a pointer device or keyboard. The source
   * event is passed along and can be used to prevent the default
   * action or stop the event from bubbling.
   */
  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void

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
  readonly type?: 'submit' | 'reset' | 'button'

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

  /**
   * ARIA roles provide semantic meaning to content, allowing screen readers and
   * other tools to present and support interaction with object in a way that is
   * consistent with user expectations of that type of object. ARIA roles can be
   * used to describe elements that don't natively exist in HTML or exist but
   * don't yet have full browser support.
   *
   * By default, many semantic elements in HTML have a role; for example, <input
   * type="radio"> has the "radio" role. Non-semantic elements in HTML do not
   * have a role; <div> and <span> without added semantics return null. The role
   * attribute can provide semantics.
   */
  readonly role?: string

  /**
   * The aria-expanded attribute is set on an element to indicate if a control
   * is expanded or collapsed, and whether or not the controlled elements are
   * displayed or hidden.
   *
   * There are several widgets that can be expanded and collapsed, including
   * menus, dialogs, and accordion panels. Each of these objects, in turn, has
   * an interactive element that controls their opening and closing. The
   * aria-expanded attribute is applied to this focusable, interactive control
   * that toggles the visibility of the object.
   */
  readonly ariaExpanded?: boolean

  /** An aria attribute indicates the availability and type of interactive popup
   * element that can be triggered by the element on which the attribute is set
   *
   * Notes: The value true is the same as menu. Any other value, including an
   * empty string or other role, is treated as if false were set.
   * */
  readonly ariaHaspopup?: AriaHasPopupType

  /**
   * Typically the contents of a button serve the purpose of describing the
   * buttons use. However, ariaLabel can be used if the contents do not suffice.
   * Such as when a button wraps an image and there is no text.
   */
  readonly ariaLabel?: string

  /**
   * Whether to only show the tooltip when the tooltip target overflows its
   * bounds. Typically this is used in conjunction with an ellipsis CSS ruleset.
   */
  readonly onlyShowTooltipWhenOverflowed?: boolean

  /** The aria-pressed attribute indicates the current "pressed" state of a
   * toggle button.
   *
   * Accessibility notes: Do not change the contents of the label on a toggle
   * button when the state changes. If a button label says "pause", do not
   * change it to "play" when pressed.
   * */
  readonly ariaPressed?: boolean

  /** Whether the input field should auto focus when mounted. */
  readonly autoFocus?: boolean
}

/**
 * A button component.
 *
 * Provide `children` elements to represent the title of the button.
 */
export class Button extends React.Component<IButtonProps, {}> {
  private innerButtonRef = createObservableRef<HTMLButtonElement>()

  public constructor(props: IButtonProps) {
    super(props)
    this.innerButtonRef.subscribe(button => this.props.onButtonRef?.(button))
  }

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focus = () => {
    this.innerButtonRef.current?.focus()
  }

  /**
   * Programmatically remove keyboard focus from the button element.
   */
  public blur() {
    this.innerButtonRef.current?.blur()
  }

  public getBoundingClientRect() {
    return this.innerButtonRef.current?.getBoundingClientRect()
  }

  public render() {
    const { disabled, tooltip } = this.props

    const className = classNames('button-component', this.props.className, {
      'small-button': this.props.size === 'small',
    })

    return (
      <button
        className={className}
        onClick={disabled ? preventDefault : this.onClick}
        onContextMenu={disabled ? preventDefault : this.onContextMenu}
        type={this.props.type || 'button'}
        ref={this.innerButtonRef}
        tabIndex={this.props.tabIndex}
        onMouseEnter={disabled ? preventDefault : this.props.onMouseEnter}
        role={this.props.role}
        aria-expanded={this.props.ariaExpanded}
        aria-disabled={disabled ? 'true' : undefined}
        aria-label={this.props.ariaLabel}
        aria-haspopup={this.props.ariaHaspopup}
        aria-pressed={this.props.ariaPressed}
        autoFocus={this.props.autoFocus}
      >
        {tooltip && (
          <Tooltip
            target={this.innerButtonRef}
            direction={TooltipDirection.NORTH}
            // Show the tooltip immediately on hover if the button is disabled
            delay={disabled && tooltip ? 0 : undefined}
            onlyWhenOverflowed={this.props.onlyShowTooltipWhenOverflowed}
          >
            {tooltip}
          </Tooltip>
        )}
        {this.props.children}
      </button>
    )
  }

  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onClick) {
      this.props.onClick(event)
    }

    if (this.props.type === undefined) {
      event.preventDefault()
    }
  }

  private onContextMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    this.props.onContextMenu?.(event)

    if (this.props.type === undefined) {
      event.preventDefault()
    }
  }
}

const preventDefault = (e: Event | React.SyntheticEvent) => e.preventDefault()
