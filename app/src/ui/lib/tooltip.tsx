import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ObservableRef } from './observable-ref'
import { createUniqueId, releaseUniqueId } from './id-pool'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { rectEquals, rectContains } from './rect'

export type TooltipDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'
const DefaultTooltipDelay = 400
const InteractiveTooltipHideDelay = 300

export interface ITooltipProps<T> {
  /**
   * The target element for which to display a tooltip. Use
   * `createObservableRef` to create an `ObservableRef`. Note that
   * `ObservablRef` is compatible with `React.Ref`
   */
  readonly target: ObservableRef<T>

  /**
   * Whether or not to modify the target element when the tooltip is showing to
   * add the necessary `aria-` attributes for accessibility. It's not
   * recommended to disable this unless the target element is already adequately
   * described by `aria-label`.
   *
   * Defaults to true
   */
  readonly accessible?: boolean

  /**
   * Whether or not the tooltip should remain open when the user moves their
   * pointer device from the target onto the tooltip itself. Non interactive
   * tooltips are not pointer event targets.
   */
  readonly interactive?: boolean

  /**
   * The amount of time to wait (in milliseconds) while a user hovers over the
   * target before displaying the tooltip. There's typically no reason to
   * increase this but it may be used to show the tooltip without any delay (by
   * setting it to zero)
   *
   * Defaults to 400ms
   */
  readonly delay?: number

  /**
   * The desired position of the tooltip in relation to the target (cardinal
   * directions). Note that the tooltip will attempt to honor the desired
   * direction but if there's not enough room to place the tooltip in said
   * direction it will be repositioned automatically.
   *
   * When no direction has been specified the tooltip is automatically
   * positioned relative to the pointer coordinates.
   */
  readonly direction?: TooltipDirection

  /**
   * An optional additional class name to set on the tooltip in order to be able
   * to apply specific styles to the tooltip
   */
  readonly className?: string
}

interface ITooltipState {
  /** The unique id of the tooltip (when shown)  */
  readonly id?: string

  /** The target element for which to display a tooltip */
  readonly target: HTMLElement | null

  /** The parent element of tooltips, typically body unless in a dialog */
  readonly tooltipHost: Element | null

  /**
   * Whether the tooltip is currently being measured (i.e. it should not be
   * visible to the user)
   **/
  readonly measure: boolean

  /** Whether or not the tooltip is currently visible to the user */
  readonly show: boolean

  /** The size and position of the target element relative to the window */
  readonly targetRect: DOMRect

  /** The size and position of the tooltip parent relative to the window */
  readonly hostRect: DOMRect

  /** The size of the window */
  readonly windowRect: DOMRect

  /** The size and position of the tooltip relative to the window */
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
      tooltipHost: tooltipHostFor(target),
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
    this.setState({ target, tooltipHost: tooltipHostFor(target) })
  }

  public onTooltipRef = (elem: HTMLDivElement | null) => {
    if (elem === null) {
      if (this.state.id) {
        releaseUniqueId(this.state.id)
        this.setState({ id: undefined })
      }
      this.resizeObserver.disconnect()
      const { tooltipRef } = this

      if (tooltipRef !== null) {
        tooltipRef.removeEventListener('mouseenter', this.onTooltipMouseEnter)
        tooltipRef.removeEventListener('mouseleave', this.onTooltipMouseLeave)
      }
    } else {
      // The tooltip has been mounted, let's measure it and show it
      this.setState({
        tooltipRect: elem.getBoundingClientRect() ?? new DOMRect(),
        show: true,
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
    elem.addEventListener('mousedown', this.onTargetMouseDown)
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
    this.mouseRect = new DOMRect(event.clientX - 10, event.clientY - 10, 20, 20)
  }

  private onTargetMouseDown = (event: MouseEvent) => {
    this.hideTooltip()
  }

  private beginShowTooltip() {
    this.cancelShowTooltip()
    this.showTooltipTimeout = window.setTimeout(
      this.showTooltip,
      this.props.delay ?? DefaultTooltipDelay
    )
  }

  private showTooltip = () => {
    const { tooltipHost, target } = this.state
    if (tooltipHost === null || target === null) {
      return
    }

    this.setState({
      measure: true,
      show: false,
      targetRect:
        this.props.direction === undefined
          ? this.mouseRect
          : target.getBoundingClientRect(),
      hostRect: tooltipHost.getBoundingClientRect(),
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
      this.hideTooltipTimeout = window.setTimeout(
        this.hideTooltip,
        InteractiveTooltipHideDelay
      )
    } else {
      this.hideTooltip()
    }
  }

  private hideTooltip = () => {
    this.cancelShowTooltip()
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
    return this.state.target === null || this.state.tooltipHost === null
      ? null
      : ReactDOM.createPortal(this.renderPortal(), this.state.tooltipHost)
  }

  private renderPortal() {
    const { show, measure } = this.state
    if (!show && !measure) {
      return null
    }
    const visible = show && !measure
    const { targetRect, hostRect, windowRect, tooltipRect } = this.state
    const { interactive, accessible } = this.props

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
  const fits = (direction: TooltipDirection) =>
    rectContains(window, getTooltipRectRelativeTo(target, direction, tooltip))

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

const tooltipHostFor = (target: Element | undefined | null) =>
  target?.closest('.tooltip-host') ?? document.body

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation()
