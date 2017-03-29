import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import * as classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'

/** The button style. */
export enum ToolbarButtonStyle {
  /** The default style with the description above the title. */
  Standard,

  /** A style in which the description is below the title. */
  Subtitle,
}

export interface IToolbarButtonProps {
  /** The primary button text, describing its function */
  readonly title?: string

  /** An optional description of the function of the button */
  readonly description?: JSX.Element | string

  /** An optional symbol to be displayed next to the button text */
  readonly icon?: OcticonSymbol

  /** The class name for the icon element. */
  readonly iconClassName?: string

  /**
   * An optional event handler for when the button is activated
   * by a pointer event or by hitting space/enter while focused.
   */
  readonly onClick?: () => void

  /**
   * A function that's called when the user hovers over the button with
   * a pointer device. Note that this only fires for mouse events inside
   * the button and not any content rendered by the preContentRenderer
   * callback.
   */
  readonly onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when a key event is received from the 
   * ToolbarButton component or any of its descendants.
   * 
   * Consumers of this event should not act on the event if the event has
   * had its default action prevented by an earlier consumer that's called
   * the preventDefault method on the event instance.
   */
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void

  /**
   * A function that's called when the button element receives keyboard focus.
   */
  readonly onButtonFocus?: (event: React.FocusEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when the button element looses keyboard focus.
   */
  readonly onButtonBlur?: (event: React.FocusEvent<HTMLButtonElement>) => void

  /**
   * An optional classname that will be appended to the default
   * class name 'toolbar-button'
   */
  readonly className?: string

  /**
   * An optional callback for rendering content inside the
   * button, just before the content wrapper. Used by the
   * dropdown component to render the foldout.
   */
  readonly preContentRenderer?: () => JSX.Element | null

  /** The button's style. Defaults to `ToolbarButtonStyle.Standard`. */
  readonly style?: ToolbarButtonStyle

  /** Whether the button's disabled. Defaults to false. */
  readonly disabled?: boolean

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
}

/**
 * A general purpose toolbar button
 */
export class ToolbarButton extends React.Component<IToolbarButtonProps, void> {

  public innerButton: Button | null = null

  private onClick = () => {
    if (this.props.onClick) {
      this.props.onClick()
    }
  }

  private onButtonRef = (ref: Button | null) => {
    this.innerButton = ref
  }

  /**
   * Programmatically move keyboard focus to the button element.
   */
  public focusButton = () => {
    if (this.innerButton) {
      this.innerButton.focus()
    }
  }

  /**
   * Programmatically remove keyboard focus from the button element.
   */
  public blurButton() {
    if (this.innerButton) {
      this.innerButton.blur()
    }
  }

  /**
   * Get the client bounding box for the button element.
   * Returns undefined if the button hasn't been mounted yet.
   */
  public getButtonBoundingClientRect = (): ClientRect | undefined => {
    return this.innerButton
      ? this.innerButton.getBoundingClientRect()
      : undefined
  }

  public render() {
    const icon = this.props.icon
      ? <Octicon symbol={this.props.icon} className={classNames('icon', this.props.iconClassName)} />
      : null

    const className = classNames('toolbar-button', this.props.className)

    const preContentRenderer = this.props.preContentRenderer
    const preContent = preContentRenderer && preContentRenderer()

    return (
      <div className={className} onKeyDown={this.props.onKeyDown}>
        {preContent}
        <Button
          onClick={this.onClick}
          ref={this.onButtonRef}
          disabled={this.props.disabled}
          onMouseEnter={this.props.onMouseEnter}
          tabIndex={this.props.tabIndex}
          onFocus={this.props.onButtonFocus}
          onBlur={this.props.onButtonBlur}
        >
          {icon}
          {this.renderText()}
          {this.props.children}
        </Button>
      </div>
    )
  }

  private renderText() {

    if (!this.props.title && !this.props.description) {
      return null
    }

    const title = this.props.title
      ? <div className='title'>{this.props.title}</div>
      : null

    const description = this.props.description
      ? <div className='description'>{this.props.description}</div>
      : null

    const style = this.props.style || ToolbarButtonStyle.Standard
    switch (style) {
      case ToolbarButtonStyle.Standard:
        return (
          <div className='text'>
            {title}
            {description}
          </div>
        )

      case ToolbarButtonStyle.Subtitle:
        return (
          <div className='text'>
            {description}
            <div className='title'>{this.props.title}</div>
          </div>
        )

      default:
        return assertNever(style, `Unknown button style: ${style}`)
    }
  }
}
