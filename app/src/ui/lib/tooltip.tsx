import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ObservableRef } from './observable-ref'
import { createUniqueId, releaseUniqueId } from './id-pool'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'

export type TooltipDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

interface ITooltipProps<T> {
  readonly target: ObservableRef<T>
  // Only if using aria-label manually
  readonly accessible?: boolean
  readonly interactive?: boolean
  readonly noDelay?: boolean
  readonly direction?: TooltipDirection
}

interface ITooltipState {
  readonly target: HTMLElement | null
  readonly tooltipContainer: HTMLElement | null
  readonly visible: boolean
  readonly targetRect: DOMRect
  readonly hostRect: DOMRect
  readonly windowRect: DOMRect
}

export class Tooltip<T extends HTMLElement> extends React.Component<
  ITooltipProps<T>,
  ITooltipState
> {
  private id: string | undefined = undefined
  private showTooltipTimeout: number | undefined = undefined
  private pointerRect = new DOMRect()

  public constructor(props: ITooltipProps<T>) {
    super(props)
    const target = props.target.current
    this.state = {
      target,
      visible: false,
      targetRect: new DOMRect(),
      hostRect: new DOMRect(),
      windowRect: new DOMRect(),
      tooltipContainer: target === null ? null : getOrCreateContainer(target),
    }
  }

  public componentDidMount() {
    this.id = createUniqueId('tooltip')
    const { target } = this.props
    target.subscribe(this.onTargetRef)

    if (target.current !== null && this.state.target !== target.current) {
      this.onTargetRef(target.current)
    } else if (this.state.target !== null) {
      this.installTooltip(this.state.target)
    }
  }

  public onTargetRef = (elem: HTMLElement | null) => {
    this.setState({
      target: elem,
      tooltipContainer: elem === null ? null : getOrCreateContainer(elem),
    })
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

    if (prevState.tooltipContainer !== this.state.tooltipContainer) {
      if (prevState.tooltipContainer?.childElementCount === 0) {
        prevState.tooltipContainer.remove()
      }
    }
  }

  private installTooltip(elem: HTMLElement) {
    if (this.id !== undefined && this.props.accessible !== false) {
      elem.setAttribute('aria-describedby', this.id)
    }

    elem.addEventListener('mouseenter', this.onTargetMouseEnter)
    elem.addEventListener('mouseleave', this.onTargetMouseLeave)
    elem.addEventListener('mousemove', this.onTargetMouseMove)
  }

  private removeTooltip(prevTarget: HTMLElement | null) {
    if (prevTarget !== null) {
      prevTarget.removeAttribute('aria-describedby')
      prevTarget.removeEventListener('mouseenter', this.onTargetMouseEnter)
      prevTarget.removeEventListener('mouseleave', this.onTargetMouseLeave)
      prevTarget.removeEventListener('mousemove', this.onTargetMouseMove)
    }

    if (this.id !== undefined) {
      releaseUniqueId(this.id)
      this.id = undefined
    }
  }

  private onTargetMouseEnter = (event: MouseEvent) => {
    if (!(event.currentTarget instanceof HTMLElement)) {
      return
    }

    this.pointerRect = new DOMRect(event.clientX, event.clientY)
    this.beginShowTooltip(event.currentTarget)
  }

  private onTargetMouseMove = (event: MouseEvent) => {
    this.pointerRect = new DOMRect(event.clientX, event.clientY)
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
    const container = this.state.tooltipContainer

    if (container === null) {
      return
    }

    this.setState({
      visible: true,
      targetRect:
        this.props.direction === undefined
          ? this.pointerRect
          : target.getBoundingClientRect(),
      hostRect: container.getBoundingClientRect(),
      windowRect: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    })
  }

  private cancelShowTooltip() {
    if (this.showTooltipTimeout !== undefined) {
      clearTimeout(this.showTooltipTimeout)
      this.showTooltipTimeout = undefined
    }
  }

  private onTargetMouseLeave = (event: MouseEvent) => {
    this.cancelShowTooltip()
    this.setState({ visible: false })
  }

  public componentWillUnmount() {
    this.cancelShowTooltip()
    this.props.target.unsubscribe(this.onTargetRef)
    this.removeTooltip(this.state.target)

    if (this.state.tooltipContainer?.childElementCount === 0) {
      this.state.tooltipContainer.remove()
    }
  }

  public render() {
    const { target, tooltipContainer } = this.state

    return target === null || tooltipContainer === null
      ? null
      : ReactDOM.createPortal(this.renderPortal(), tooltipContainer)
  }

  private renderPortal() {
    const { visible, targetRect, hostRect, windowRect } = this.state
    const { interactive } = this.props

    const mW = 400
    const mH = 300

    const direction = visible
      ? getDirection(this.props.direction, targetRect, windowRect, mW, mH)
      : 's'

    const size: React.CSSProperties = {
      width: `${mW}px`,
      height: `${mH}px`,
      maxWidth: `${mW}px`,
      maxHeight: `${mH}px`,
    }

    const style: React.CSSProperties = visible
      ? {
          ...getTooltipPositionStyle(direction, targetRect, hostRect, mW, mH),
          ...size,
        }
      : { display: 'none' }

    const ariaHidden =
      this.props.accessible !== false && visible ? 'false' : 'true'

    const className = classNames('tooltip', {
      interactive,
      [`tooltip-${direction}`]: visible,
    })

    return (
      <div
        role="tooltip"
        aria-hidden={ariaHidden}
        className={className}
        id={this.id}
        style={style}
      >
        {/* <div className="tip"></div> */}
        <div className="bubble">{this.props.children}</div>
      </div>
    )
  }
}

function createContainer(parent: Element) {
  const container = document.createElement('div')
  container.classList.add('tooltips')
  return parent.appendChild(container)
}

function getOrCreateContainer(elem: HTMLElement): HTMLElement | null {
  const host = elem.closest('.tooltip-host') ?? document.body
  return host.querySelector(':scope >.tooltips') ?? createContainer(host)
}

function getDirection(
  direction: TooltipDirection | undefined,
  target: DOMRect,
  window: DOMRect,
  maxWidth: number,
  maxHeight: number
): TooltipDirection {
  const fits = (direction: TooltipDirection) => {
    const r = getTooltipRectRelativeTo(target, direction, maxWidth, maxHeight)
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
  maxWidth: number,
  maxHeight: number
): React.CSSProperties {
  const r = getTooltipRectRelativeTo(target, direction, maxWidth, maxHeight)
  r.x -= host.x
  r.y -= host.y

  if (direction === 'nw') {
    return {
      right: `${host.width - r.left}px`,
      bottom: `${host.height - r.bottom}px`,
    }
  } else if (direction === 'n' || direction === 'ne') {
    return { left: `${r.left}px`, bottom: `${host.height - r.bottom}px` }
  } else if (direction === 'e' || direction === 's' || direction === 'se') {
    return { left: `${r.left}px`, top: `${r.top}px` }
  } else if (direction === 'sw' || direction === 'w') {
    return { right: `${host.width - r.left}px`, top: `${r.top}px` }
  }

  return assertNever(direction, `Unknown direction ${direction}`)
}

function getTooltipRectRelativeTo(
  target: DOMRect,
  direction: TooltipDirection,
  w: number,
  h: number
) {
  const { left: xLeft, right: xRight, bottom: yBotttom } = target
  const xCenter = target.left + target.width / 2
  const yTop = target.top - h
  const yCenter = target.top + target.height / 2 - h / 2

  switch (direction) {
    case 'ne':
      return new DOMRect(xCenter, yTop, w, h)
    case 'n':
      return new DOMRect(xCenter - w / 2, yTop, w, h)
    case 'nw':
      return new DOMRect(xCenter, yTop, w, h)
    case 'e':
      return new DOMRect(xRight, yCenter, w, h)
    case 'se':
      return new DOMRect(xCenter, yBotttom, w, h)
    case 's':
      return new DOMRect(xCenter - w / 2, yBotttom, w, h)
    case 'sw':
      return new DOMRect(xCenter, yBotttom, w, h)
    case 'w':
      return new DOMRect(xLeft, yCenter, w, h)
    default:
      return assertNever(direction, `Unknown direction ${direction}`)
  }
}
