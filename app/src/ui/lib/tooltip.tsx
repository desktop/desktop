import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ObservableRef } from './observable-ref'
import { createUniqueId, releaseUniqueId } from './id-pool'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { rectEquals } from './rect'

export type TooltipDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface ITooltipProps<T> {
  readonly target: ObservableRef<T>
  // Only if using aria-label manually
  readonly accessible?: boolean
  readonly interactive?: boolean
  readonly noDelay?: boolean
  readonly direction?: TooltipDirection
  readonly className?: string
}

interface ITooltipState {
  readonly id?: string
  readonly target: HTMLElement | null
  readonly tooltipContainer: Element | null
  readonly measure: boolean
  readonly show: boolean
  readonly targetRect: DOMRect
  readonly hostRect: DOMRect
  readonly windowRect: DOMRect
  readonly tooltipRect: DOMRect
}

export class Tooltip<T extends HTMLElement> extends React.Component<
  ITooltipProps<T>,
  ITooltipState
> {
  private mouseRect = new DOMRect()

  private showTooltipTimeout: number | null = null
  private hideTooltipTimeout: number | null = null

  private tooltipRef: HTMLElement | null = null

  private readonly resizeObserver: ResizeObserver

  public constructor(props: ITooltipProps<T>) {
    super(props)
    const target = props.target.current
    this.state = {
      target,
      measure: false,
      show: false,
      targetRect: new DOMRect(),
      hostRect: new DOMRect(),
      windowRect: new DOMRect(),
      tooltipRect: new DOMRect(),
      tooltipContainer: tooltipContainerFor(target),
    }

    this.resizeObserver = new ResizeObserver(entries => {
      const tooltipRect = entries[0]?.target?.getBoundingClientRect()
      if (tooltipRect && !rectEquals(this.state.tooltipRect, tooltipRect)) {
        this.setState({ tooltipRect })
      }
    })
  }

  public componentDidMount() {
    const { target } = this.props
    target.subscribe(this.onTargetRef)

    if (target.current !== null && this.state.target !== target.current) {
      this.onTargetRef(target.current)
    } else if (this.state.target !== null) {
      this.installTooltip(this.state.target)
    }
  }

  public onTargetRef = (target: HTMLElement | null) => {
    const tooltipContainer = tooltipContainerFor(target)
    this.setState({ target, tooltipContainer })
  }

  public onTooltipRef = (elem: HTMLDivElement | null) => {
    if (elem === null) {
      if (this.state.id) {
        releaseUniqueId(this.state.id)
        this.setState({ id: undefined })
      }
      this.resizeObserver.disconnect()

      if (this.tooltipRef !== null) {
        this.tooltipRef.removeEventListener(
          'mouseenter',
          this.onTooltipMouseEnter
        )
        this.tooltipRef.removeEventListener(
          'mouseleave',
          this.onTooltipMouseLeave
        )
      }
    } else {
      this.setState({
        tooltipRect: elem.getBoundingClientRect() ?? new DOMRect(),
        show: elem !== null,
        measure: false,
        id: this.state.id ?? createUniqueId('tooltip'),
      })
      this.resizeObserver.observe(elem)
      if (this.props.interactive === true) {
        elem.addEventListener('mouseenter', this.onTooltipMouseEnter)
        elem.addEventListener('mouseleave', this.onTooltipMouseLeave)
      }
    }

    this.tooltipRef = elem
  }

  private onTooltipMouseEnter = (e: MouseEvent) => this.cancelHideTooltip()
  private onTooltipMouseLeave = (e: MouseEvent) => this.beginHideTooltip()

  public componentDidUpdate(
    prevProps: ITooltipProps<T>,
    prevState: ITooltipState
  ) {
    const { target } = this.state

    if (prevProps.target !== this.props.target) {
      prevProps.target.unsubscribe(this.onTargetRef)
      this.props.target.subscribe(this.onTargetRef)
    }

    if (target !== prevState.target) {
      if (target === null) {
        this.removeTooltip(prevState.target)
      } else {
        this.installTooltip(target)
      }
    }

    if (this.state.show !== prevState.show) {
      if (this.state.show && this.props.accessible !== false && this.state.id) {
        target?.setAttribute('aria-describedby', this.state.id)
      } else {
        target?.removeAttribute('aria-describedby')
      }
    }
  }

  private installTooltip(elem: HTMLElement) {
    elem.addEventListener('mouseenter', this.onTargetMouseEnter)
    elem.addEventListener('mouseleave', this.onTargetMouseLeave)
    elem.addEventListener('mousemove', this.onTargetMouseMove)
  }

  private removeTooltip(prevTarget: HTMLElement | null) {
    if (prevTarget !== null) {
      if (prevTarget.getAttribute('aria-describedby')) {
        prevTarget.removeAttribute('aria-describedby')
      }
      prevTarget.removeEventListener('mouseenter', this.onTargetMouseEnter)
      prevTarget.removeEventListener('mouseleave', this.onTargetMouseLeave)
      prevTarget.removeEventListener('mousemove', this.onTargetMouseMove)
    }
  }

  private onTargetMouseEnter = (event: MouseEvent) => {
    this.cancelHideTooltip()
    if (!this.state.show) {
      this.beginShowTooltip()
    }
  }

  private onTargetMouseMove = (event: MouseEvent) => {
    this.mouseRect = new DOMRect(event.clientX - 5, event.clientY - 5, 10, 10)
  }

  private beginShowTooltip() {
    this.cancelShowTooltip()

    if (this.props.noDelay === true) {
      this.showTooltip()
    } else {
      this.showTooltipTimeout = window.setTimeout(this.showTooltip, 400)
    }
  }

  private showTooltip = () => {
    const { tooltipContainer, target } = this.state
    if (tooltipContainer === null || target === null) {
      return
    }

    this.setState({
      measure: true,
      show: false,
      targetRect: !this.props.direction
        ? this.mouseRect
        : target.getBoundingClientRect(),
      hostRect: tooltipContainer.getBoundingClientRect(),
      windowRect: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    })
  }

  private cancelShowTooltip() {
    if (this.showTooltipTimeout !== null) {
      clearTimeout(this.showTooltipTimeout)
      this.showTooltipTimeout = null
    }
  }

  private onTargetMouseLeave = (event: MouseEvent) => {
    this.beginHideTooltip()
  }

  private beginHideTooltip() {
    this.cancelShowTooltip()

    if (this.props.interactive === true && this.hideTooltipTimeout === null) {
      this.hideTooltipTimeout = window.setTimeout(this.hideTooltip, 300)
    } else {
      this.hideTooltip()
    }
  }

  private hideTooltip = () => {
    this.cancelHideTooltip()
    this.setState({ show: false, measure: false })
  }

  private cancelHideTooltip() {
    if (this.hideTooltipTimeout !== null) {
      clearTimeout(this.hideTooltipTimeout)
      this.hideTooltipTimeout = null
    }
  }

  public componentWillUnmount() {
    this.cancelShowTooltip()
    this.props.target.unsubscribe(this.onTargetRef)
    this.removeTooltip(this.state.target)

    if (this.state.id) {
      releaseUniqueId(this.state.id)
    }
  }

  public render() {
    const { target, tooltipContainer } = this.state

    return target === null || tooltipContainer === null
      ? null
      : ReactDOM.createPortal(this.renderPortal(), tooltipContainer)
  }

  private renderPortal() {
    const {
      show,
      measure,
      targetRect,
      hostRect,
      windowRect,
      tooltipRect,
    } = this.state

    const { interactive, accessible } = this.props

    if (!show && !measure) {
      return null
    }

    const visible = show && !measure
    const direction = visible
      ? getDirection(this.props.direction, targetRect, windowRect, tooltipRect)
      : 's'

    const style: React.CSSProperties = visible
      ? getTooltipPositionStyle(direction, targetRect, hostRect, tooltipRect)
      : { visibility: 'hidden', left: `0px`, top: `0px` }

    const ariaHidden = accessible === false || !visible ? 'true' : 'false'

    const className = classNames('tooltip', this.props.className, {
      interactive,
      [`tooltip-${direction}`]: show,
    })

    return (
      <div
        role="tooltip"
        aria-hidden={ariaHidden}
        className={className}
        id={this.state.id}
        style={style}
        ref={this.onTooltipRef}
        // https://github.com/facebook/react/issues/11387
        onClick={stopPropagation}
        onContextMenu={stopPropagation}
        onDoubleClick={stopPropagation}
        onDrag={stopPropagation}
        onDragEnd={stopPropagation}
        onDragEnter={stopPropagation}
        onDragExit={stopPropagation}
        onDragLeave={stopPropagation}
        onDragOver={stopPropagation}
        onDragStart={stopPropagation}
        onDrop={stopPropagation}
        onMouseDown={stopPropagation}
        onMouseEnter={stopPropagation}
        onMouseLeave={stopPropagation}
        onMouseMove={stopPropagation}
        onMouseOver={stopPropagation}
        onMouseOut={stopPropagation}
        onMouseUp={stopPropagation}
        onKeyDown={stopPropagation}
        onKeyPress={stopPropagation}
        onKeyUp={stopPropagation}
        onFocus={stopPropagation}
        onBlur={stopPropagation}
        onChange={stopPropagation}
        onInput={stopPropagation}
        onInvalid={stopPropagation}
        onSubmit={stopPropagation}
      >
        <div className="tooltip-content">{this.props.children}</div>
      </div>
    )
  }
}

function getDirection(
  direction: TooltipDirection | undefined,
  target: DOMRect,
  window: DOMRect,
  tooltip: DOMRect
): TooltipDirection {
  const fits = (direction: TooltipDirection) => {
    const r = getTooltipRectRelativeTo(target, direction, tooltip)
    return (
      r.top >= window.top &&
      r.left >= window.left &&
      r.bottom <= window.bottom &&
      r.right <= window.right
    )
  }

  let candidates = new Set<TooltipDirection>([
    'n',
    'ne',
    'nw',
    's',
    'se',
    'sw',
    'e',
    'w',
  ])

  // We'll attempt to honor the desired placement but if it won't fit we'll
  // move it around until it does.
  if (direction !== undefined) {
    if (fits(direction)) {
      return direction
    }

    // Try to respect the desired direction by changing the order
    if (direction.startsWith('s')) {
      candidates = new Set(['s', 'se', 'sw', ...candidates])
    } else if (direction.startsWith('n')) {
      candidates = new Set(['n', 'ne', 'nw', ...candidates])
    }

    // We already know it won't fit
    candidates.delete(direction)
  } else {
    // Placement based on mouse position, prefer south east, north east
    candidates = new Set(['se', 'ne', ...candidates])
  }

  for (const candidate of candidates) {
    if (fits(candidate)) {
      return candidate
    }
  }

  // Fall back to south even though it doesn't fit
  return 's'
}

function getTooltipPositionStyle(
  direction: TooltipDirection,
  target: DOMRect,
  host: DOMRect,
  tooltip: DOMRect
): React.CSSProperties {
  const r = getTooltipRectRelativeTo(target, direction, tooltip)
  r.x -= host.x
  r.y -= host.y

  return { transform: `translate(${r.left}px, ${r.top}px)` }
}

function getTooltipRectRelativeTo(
  target: DOMRect,
  direction: TooltipDirection,
  tooltip: DOMRect
) {
  const { left: xLeft, right: xRight, bottom: yBotttom } = target
  const xMid = target.left + target.width / 2
  const yTop = target.top - tooltip.height
  const yMid = target.top + target.height / 2 - tooltip.height / 2
  const { width: w, height: h } = tooltip
  const tip = new DOMRect(10, 0, 6, 6)

  switch (direction) {
    case 'ne':
      return new DOMRect(xMid - tip.x - tip.width, yTop - tip.height, w, h)
    case 'n':
      return new DOMRect(xMid - w / 2, yTop - tip.height, w, h)
    case 'nw':
      return new DOMRect(xMid - w + tip.right, yTop - tip.height, w, h)
    case 'e':
      return new DOMRect(xRight + tip.width, yMid, w, h)
    case 'se':
      return new DOMRect(xMid - tip.x - tip.width, yBotttom + tip.height, w, h)
    case 's':
      return new DOMRect(xMid - w / 2, yBotttom + tip.height, w, h)
    case 'sw':
      return new DOMRect(xMid - w + tip.right, yBotttom + tip.height, w, h)
    case 'w':
      return new DOMRect(xLeft - w - tip.width, yMid, w, h)
    default:
      return assertNever(direction, `Unknown direction ${direction}`)
  }
}

const tooltipContainerFor = (target: Element | undefined | null) =>
  target?.closest('.tooltip-host') ?? document.body

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation()
