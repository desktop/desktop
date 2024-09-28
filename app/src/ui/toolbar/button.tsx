/* eslint-disable jsx-a11y/no-static-element-interactions */
import * as React from 'react'
import { Octicon, OcticonSymbol } from '../octicons'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { Button } from '../lib/button'
import { clamp } from '../../lib/clamp'
import { createObservableRef } from '../lib/observable-ref'
import { Tooltip, TooltipDirection, TooltipTarget } from '../lib/tooltip'
import { AriaHasPopupType } from '../lib/aria-types'
import { enableResizingToolbarButtons } from '../../lib/feature-flag'

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
   * An optional event handler for when the button's context menu
   * is activated by a pointer event or by hitting the menu key
   * while focused.
   */
  readonly onContextMenu?: (event: React.MouseEvent<HTMLButtonElement>) => void

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

  /**
   * Optional, custom overrided of the Tooltip components internal logic for
   * determining whether the tooltip target is overflowed or not.
   *
   * The internal overflow logic is simple and relies on the target itself
   * having the `text-overflow` CSS rule applied to it. In some scenarios
   * consumers may have a deep child element which is the one that should be
   * tested for overflow while still having the parent element be the pointer
   * device hit area.
   *
   * Consumers may pass a boolean if the overflowed state is known at render
   * time or they may pass a function which gets executed just before showing
   * the tooltip.
   */
  readonly isOverflowed?: ((target: TooltipTarget) => boolean) | boolean
}

/**
 * A general purpose toolbar button
 */
export class ToolbarButton extends React.Component<IToolbarButtonProps, {}> {
  public wrapperRef = createObservableRef<HTMLDivElement>()
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
    const { tooltip } = this.props
    const icon = this.props.icon ? (
      <Octicon
        symbol={this.props.icon}
        className={classNames('icon', this.props.iconClassName)}
      />
    ) : null

    const className = classNames(
      'toolbar-button',
      { 'has-progress': this.props.progressValue !== undefined },
      { resizable: enableResizingToolbarButtons() },
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
        ref={this.wrapperRef}
      >
        {tooltip && (
          <Tooltip
            target={this.wrapperRef}
            direction={TooltipDirection.SOUTH}
            onlyWhenOverflowed={this.props.onlyShowTooltipWhenOverflowed}
            isTargetOverflowed={this.props.isOverflowed}
          >
            {tooltip}
          </Tooltip>
        )}
        <Button
          onClick={this.onClick}
          onContextMenu={this.props.onContextMenu}
          ref={this.onButtonRef}
          disabled={this.props.disabled}
          onMouseEnter={this.props.onMouseEnter}
          tabIndex={this.props.tabIndex}
          role={this.props.role}
          ariaExpanded={this.props.ariaExpanded}
          ariaHaspopup={this.props.ariaHaspopup}
          ariaLabel={this.props.ariaLabel}
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
