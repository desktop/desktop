import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ObservableRef } from './observable-ref'
import { createUniqueId, releaseUniqueId } from './id-pool'
import classNames from 'classnames'

interface ITooltipProps<T> {
  readonly target: ObservableRef<T>
  // Only if using aria-label manually
  readonly accessible?: boolean
  readonly interactive?: boolean
  readonly noDelay?: boolean
}

interface ITooltipState {
  readonly target: HTMLElement | null
  readonly visibleAt?: TooltipPosition
}

type TooltipPosition = { x: number; y: number }

export class Tooltip<T extends HTMLElement> extends React.Component<
  ITooltipProps<T>,
  ITooltipState
> {
  private static globalWrapper: HTMLDivElement | null = null
  private id: string | undefined = undefined
  private showTooltipTimeout: number | undefined = undefined

  public constructor(props: ITooltipProps<T>) {
    super(props)
    this.state = { target: props.target.current }
  }

  public componentDidMount() {
    this.id = createUniqueId('tooltip')
    this.props.target.subscribe(this.onTargetRef)
    if (
      this.props.target.current !== null &&
      this.state.target !== this.props.target.current
    ) {
      this.setState({ target: this.props.target.current })
    } else if (this.state.target !== null) {
      this.installTooltip(this.state.target)
    }
  }

  public onTargetRef = (elem: HTMLElement | null) => {
    this.setState({ target: elem })
  }

  public componentDidUpdate(
    prevProps: ITooltipProps<T>,
    prevState: ITooltipState
  ) {
    if (prevProps.target !== this.props.target) {
      prevProps.target.unsubscribe(this.onTargetRef)
      this.props.target.subscribe(this.onTargetRef)
    }

    if (this.state.target !== prevState.target) {
      if (this.state.target === null) {
        this.removeTooltip(prevState.target)
      } else {
        this.installTooltip(this.state.target)
      }
    } else if (this.state.target !== null) {
      if (prevProps.accessible !== this.props.accessible) {
        if (this.id !== undefined && this.props.accessible !== false) {
          this.state.target.setAttribute('aria-describedby', this.id)
        } else if (this.props.accessible === false) {
          this.state.target.removeAttribute('aria-describedby')
        }
      }
    }
  }

  private installTooltip(elem: HTMLElement) {
    if (this.id !== undefined && this.props.accessible !== false) {
      elem.setAttribute('aria-describedby', this.id)
    }

    elem.addEventListener('mouseenter', this.onTargetMouseEnter)
    elem.addEventListener('mouseleave', this.onTargetMouseLeave)
  }

  private removeTooltip(prevTarget: HTMLElement | null) {
    if (prevTarget !== null) {
      prevTarget.removeAttribute('aria-describedby')
      prevTarget.removeEventListener('mouseenter', this.onTargetMouseEnter)
      prevTarget.removeEventListener('mouseleave', this.onTargetMouseLeave)
    }

    if (this.id !== undefined) {
      releaseUniqueId(this.id)
      this.id = undefined
    }

    if (Tooltip.globalWrapper?.childElementCount === 0) {
      Tooltip.globalWrapper.remove()
      Tooltip.globalWrapper = null
    }
  }

  private onTargetMouseEnter = (event: MouseEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return
    }

    this.beginShowTooltip(event.currentTarget)
  }

  private beginShowTooltip(target: HTMLElement) {
    this.cancelShowTooltip()
    if (this.props.noDelay === true) {
      this.showTooltip(target)
    } else {
      this.showTooltipTimeout = window.setTimeout(
        () => this.showTooltip(target),
        400
      )
    }
  }

  private showTooltip(target: HTMLElement) {
    const { x, y } = target.getBoundingClientRect()
    this.setState({ visibleAt: { x, y: y + 30 } })
  }

  private cancelShowTooltip() {
    if (this.showTooltipTimeout !== undefined) {
      clearTimeout(this.showTooltipTimeout)
      this.showTooltipTimeout = undefined
    }
  }

  private onTargetMouseLeave = (event: MouseEvent) => {
    this.cancelShowTooltip()
    this.setState({ visibleAt: undefined })
  }

  public componentWillUnmount() {
    this.cancelShowTooltip()
    this.props.target.unsubscribe(this.onTargetRef)
    this.removeTooltip(this.state.target)
  }

  public render() {
    if (this.state.target === null) {
      return null
    }

    if (Tooltip.globalWrapper === null) {
      Tooltip.globalWrapper = document.createElement('div')
      Tooltip.globalWrapper.classList.add('tooltips')
      document.body.appendChild(Tooltip.globalWrapper)
    }

    return ReactDOM.createPortal(this.renderPortal(), Tooltip.globalWrapper)
  }

  private renderPortal() {
    const { visibleAt } = this.state
    const style: React.CSSProperties = visibleAt
      ? { left: `${visibleAt.x}px`, top: `${visibleAt.y}px` }
      : { display: 'none' }

    const ariaHidden =
      this.props.accessible !== false && visibleAt !== undefined
        ? 'false'
        : 'true'

    const className = classNames('tooltip', {
      interactive: this.props.interactive === true,
    })

    return (
      <div
        role="tooltip"
        aria-hidden={ariaHidden}
        className={className}
        id={this.id}
        style={style}
      >
        {this.props.children}
      </div>
    )
  }
}
