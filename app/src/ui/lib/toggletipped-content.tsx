import * as React from 'react'
import { ITooltipProps, Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'
import classNames from 'classnames'
import { AriaLiveContainer } from '../accessibility/aria-live-container'

/**
 * IToggledtippedContentProps is a superset of ITooltipProps but does not
 * define the `target` prop as that's set programatically in render
 */
interface IToggledtippedContentProps
  extends Omit<ITooltipProps<HTMLElement>, 'target'> {
  /** The tooltip contents */
  readonly tooltip: JSX.Element | string | undefined

  /**
   * An optional additional class name to set on the tooltip in order to be able
   * to apply specific styles to the tooltip
   */
  readonly tooltipClassName?: string

  /** An optional class name to set on the wrapper element */
  readonly className?: string

  /** An optional aria-label property in case children is not descriptive
   * - for example an icon */
  readonly ariaLabel?: string
}

/**
 * A less keyboard toggleable version of the Tooltip content component for when
 * it's acceptable to add a wrapping element around the content. The content
 * will be wrapped in a button as it is toggleable. supports all the options
 * that the Tooltip component does without having to worry about refs.
 **/
export class ToggledtippedContent extends React.Component<IToggledtippedContentProps> {
  private buttonRef = createObservableRef<HTMLButtonElement>()
  private shouldForceAriaLiveMessage = false
  private tooltipVisible = false

  private onToggle = () => {
    this.shouldForceAriaLiveMessage = !this.shouldForceAriaLiveMessage
  }

  private onTooltipVisible = () => {
    this.tooltipVisible = true
  }

  private onTooltipHidden = () => {
    this.tooltipVisible = false
  }

  public componentDidMount(): void {
    this.buttonRef.subscribe(this.onButtonRef)
  }

  private onButtonRef = (ref: HTMLButtonElement | null) => {
    if (ref === null) {
      this.buttonRef.current?.removeEventListener(
        'tooltip-shown',
        this.onTooltipVisible
      )
    } else {
      ref.addEventListener('tooltip-hidden', this.onTooltipHidden)
    }
  }

  public render() {
    const {
      tooltip,
      children,
      className,
      tooltipClassName,
      ariaLabel,
      ...rest
    } = this.props

    const classes = classNames('toggletip', className)

    return (
      <button
        ref={this.buttonRef}
        className={classes}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        onClick={this.onToggle}
      >
        <>
          {tooltip !== undefined && (
            <Tooltip
              target={this.buttonRef}
              className={tooltipClassName}
              isToggleTip={true}
              {...rest}
            >
              {tooltip}
            </Tooltip>
          )}
          {children}
          {this.tooltipVisible && (
            <AriaLiveContainer
              shouldForceChange={this.shouldForceAriaLiveMessage}
            >
              {tooltip}
            </AriaLiveContainer>
          )}
        </>
      </button>
    )
  }
}
