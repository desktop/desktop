import * as React from 'react'
import { ITooltipProps, Tooltip } from './tooltip'
import { createObservableRef } from './observable-ref'

interface ITooltippedContentProps
  extends Omit<ITooltipProps<HTMLElement>, 'target'> {
  readonly tooltip: JSX.Element | string | undefined
  readonly wrapperElement?: 'span' | 'div'
  readonly wrapperRef?: React.Ref<HTMLElement>
  readonly tooltipClassName?: string
  readonly className?: string
  readonly onlyWhenOverflowed?: boolean
}

interface ITooltippedContentState {
  readonly overflowed?: boolean
}

/**
 * A less complicated version of the Tooltip component for when it's acceptable
 * to add a wrapping element around the content. supports all the options that
 * the Tooltip component does without having to worry about refs.
 **/
export class TooltippedContent extends React.Component<
  ITooltippedContentProps,
  ITooltippedContentState
> {
  private wrapperRef = createObservableRef<HTMLElement>()
  private readonly resizeObserver: ResizeObserver

  public constructor(props: ITooltippedContentProps) {
    super(props)
    this.state = {}
    this.wrapperRef.subscribe(this.onWrapperRef)

    this.resizeObserver = new ResizeObserver(() => {
      this.checkIfOverflowed()
    })
  }

  private onWrapperRef = (elem: HTMLElement | null) => {
    this.checkIfOverflowed()
  }

  private checkIfOverflowed() {
    const elem = this.wrapperRef.current

    if (elem !== null) {
      const overflowed = elem.scrollWidth > elem.clientWidth
      if (this.state.overflowed !== overflowed) {
        this.setState({ overflowed })
      }
    }
  }

  public componentDidMount() {
    if (this.wrapperRef.current && this.props.onlyWhenOverflowed) {
      this.checkIfOverflowed()
    }
  }

  public componentDidUpdate(prevProps: ITooltippedContentProps) {
    if (prevProps.onlyWhenOverflowed !== this.props.onlyWhenOverflowed) {
      if (this.props.onlyWhenOverflowed && this.wrapperRef.current) {
        this.resizeObserver.observe(this.wrapperRef.current)
        this.checkIfOverflowed()
      } else {
        this.resizeObserver.disconnect()
        this.setState({ overflowed: undefined })
      }
    }
  }

  public render() {
    const { overflowed } = this.state
    const {
      tooltip,
      wrapperElement,
      children,
      className,
      tooltipClassName,
      onlyWhenOverflowed,
      ...rest
    } = this.props

    const renderTooltip =
      tooltip !== undefined && (!onlyWhenOverflowed || overflowed)

    return React.createElement(wrapperElement ?? 'span', {
      ref: this.wrapperRef,
      className: className,
      children: (
        <>
          {renderTooltip && (
            <Tooltip
              target={this.wrapperRef}
              className={tooltipClassName}
              {...rest}
            >
              {tooltip}
            </Tooltip>
          )}
          {children}
        </>
      ),
    })
  }
}
