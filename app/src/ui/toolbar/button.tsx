import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { clamp } from '../../lib/clamp'

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

  /** The tooltip for the button. */
  readonly tooltip?: string

  /** An optional symbol to be displayed next to the button text */
  readonly icon?: OcticonSymbol

  /** The class name for the icon element. */
  readonly iconClassName?: string

  /**
   * An optional event handler for when the button is activated
   * by a pointer event or by hitting space/enter while focused.
   */
  readonly onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when the user hovers over the button with
   * a pointer device.
   */
  readonly onMouseEnter?: (event: React.MouseEvent<HTMLButtonElement>) => void

  /**
   * A function that's called when a key event is received from the
   * ToolbarButton component or any of its descendants.
   */
  readonly onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void

  /**
   * An optional classname that will be appended to the default
   * class name 'toolbar-button'
   */
  readonly className?: string

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

  /**
   * An optional progress value as a fraction between 0 and 1. Passing a number
   * greater than zero will render a progress bar background in the toolbar
   * button. Use this to communicate an ongoing operation.
   *
   * Consumers should not rely solely on the visual progress bar, they should
   * also implement alternative representation such as showing a percentage
   * text in the description or title along with information about what
   * operation is currently in flight.
   */
  readonly progressValue?: number

  readonly role?: string
  readonly ariaExpanded?: boolean
}

/**
 * A general purpose toolbar button
 */
export class ToolbarButton extends React.Component<IToolbarButtonProps, {}> {
  public innerButton: Button | null = null

  private onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (this.props.onClick) {
      this.props.onClick(event)
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
   * Get the client bounding box for the button element.
   * Returns undefined if the button hasn't been mounted yet.
   */
  public getButtonBoundingClientRect = (): ClientRect | undefined => {
    return this.innerButton
      ? this.innerButton.getBoundingClientRect()
      : undefined
  }

  public render() {
    const icon = this.props.icon ? (
      <Octicon
        symbol={this.props.icon}
        className={classNames('icon', this.props.iconClassName)}
      />
    ) : null

    const className = classNames(
      'toolbar-button',
      { 'has-progress': this.props.progressValue !== undefined },
      this.props.className
    )

    const progressValue =
      this.props.progressValue !== undefined
        ? Math.round(clamp(this.props.progressValue, 0, 1) * 100) / 100
        : undefined

    const progress =
      progressValue !== undefined ? (
        <div
          className="progress"
          style={{ transform: `scaleX(${progressValue})` }}
        />
      ) : undefined

    return (
      <div
        className={className}
        onKeyDown={this.props.onKeyDown}
        title={this.props.tooltip}
      >
        <Button
          onClick={this.onClick}
          ref={this.onButtonRef}
          disabled={this.props.disabled}
          onMouseEnter={this.props.onMouseEnter}
          tabIndex={this.props.tabIndex}
          role={this.props.role}
          ariaExpanded={this.props.ariaExpanded}
        >
          {progress}
          {icon}
          {this.renderText()}
          {this.props.children}
        </Button>
      </div>
    )
  }

  private renderText() {
    if (
      this.props.title === undefined &&
      this.props.description === undefined
    ) {
      return null
    }

    const title =
      this.props.title !== undefined ? (
        <div className="title">{this.props.title}</div>
      ) : null

    const description =
      this.props.description !== undefined ? (
        <div className="description">{this.props.description}</div>
      ) : null

    const style = this.props.style || ToolbarButtonStyle.Standard
    switch (style) {
      case ToolbarButtonStyle.Standard:
        return (
          <div className="text">
            {description}
            {title}
          </div>
        )

      case ToolbarButtonStyle.Subtitle:
        return (
          <div className="text">
            <div className="title">{this.props.title}</div>
            {description}
          </div>
        )

      default:
        return assertNever(style, `Unknown button style: ${style}`)
    }
  }
}
