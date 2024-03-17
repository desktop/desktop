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

  /** Likely the tooltips content as a string - whatever needs to be
   * communicated to a screen reader user that is communicated through the
   * tooltip */
  readonly ariaLiveMessage: string

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

interface IToggledtippedContentState {
  /** State of when the tooltip is visible */
  readonly tooltipVisible: boolean
}

/**
 * A less keyboard toggleable version of the Tooltip content component for when
 * it's acceptable to add a wrapping element around the content. The content
 * will be wrapped in a button as it is toggleable. supports all the options
 * that the Tooltip component does without having to worry about refs.
 **/
export class ToggledtippedContent extends React.Component<
  IToggledtippedContentProps,
  IToggledtippedContentState
> {
  private buttonRef: HTMLButtonElement | null = null
  private buttonRefObservable = createObservableRef<HTMLButtonElement>()
  private shouldForceAriaLiveMessage = false

  public constructor(props: IToggledtippedContentProps) {
    super(props)
    this.state = {
      tooltipVisible: false,
    }

    this.buttonRefObservable.subscribe(this.onButtonRef)
  }

  private onToggle = () => {
    this.shouldForceAriaLiveMessage = !this.shouldForceAriaLiveMessage
  }

  private onTooltipVisible = () => {
    this.setState({ tooltipVisible: true })
  }

  private onTooltipHidden = () => {
    this.setState({ tooltipVisible: false })
  }

  private onButtonRef = (ref: HTMLButtonElement | null) => {
    if (ref === null) {
      const currRef = this.buttonRef
      currRef?.removeEventListener('tooltip-shown', this.onTooltipVisible)
      currRef?.removeEventListener('tooltip-hidden', this.onTooltipHidden)
    } else {
      ref.addEventListener('tooltip-shown', this.onTooltipVisible)
      ref.addEventListener('tooltip-hidden', this.onTooltipHidden)
    }
    this.buttonRef = ref
  }

  public render() {
    const {
      tooltip,
      children,
      className,
      tooltipClassName,
      ariaLabel,
      ariaLiveMessage,
      ...rest
    } = this.props

    const classes = classNames('toggletip', className)

    return (
      <button
        ref={this.buttonRefObservable}
        className={classes}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        type="button"
        onClick={this.onToggle}
      >
        <>
          {tooltip !== undefined && (
            <Tooltip
              target={this.buttonRefObservable}
              className={tooltipClassName}
              isToggleTip={true}
              {...rest}
            >
              {tooltip}
            </Tooltip>
          )}
          {children}
          {this.state.tooltipVisible && (
            <AriaLiveContainer
              message={ariaLiveMessage}
              trackedUserInput={this.shouldForceAriaLiveMessage}
            />
          )}
        </>
      </button>
    )
  }
}
