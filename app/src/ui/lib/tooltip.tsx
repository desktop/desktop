import * as React from 'react'
import * as ReactDOM from 'react-dom'
import { ObservableRef } from './observable-ref'
import { createUniqueId, releaseUniqueId } from './id-pool'
import classNames from 'classnames'
import { assertNever } from '../../lib/fatal-error'
import { rectEquals, rectContains, offsetRect } from './rect'

export enum TooltipDirection {
  NORTH = 'n',
  NORTH_EAST = 'ne',
  EAST = 'e',
  SOUTH_EAST = 'se',
  SOUTH = 's',
  SOUTH_WEST = 'sw',
  WEST = 'w',
  NORTH_WEST = 'nw',
}

const DefaultTooltipDelay = 400
const InteractiveTooltipHideDelay = 250

// Curse you SVGSVGElement. So the `<svg>` tag which is represented in the DOM
// as SVGSVGElement does not inherit HTMLElement like most other tags we'd be
// dealing with like <p>, <div> etc so we can't use that however convenient it
// would be. What we really care about though is the basic methods from Element
// like setAttribute etc coupled with the pointer-specific events from
// HTMLElement like mouseenter, mouseleave etc. So we make our own type here.
export type TooltipTarget = Element & GlobalEventHandlers

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
   * Whether or not the tooltip should be dismissable via the escape key. This
   * is generally true, but if the tooltip is communicating something important
   * to the user, such as an input error, it should not be dismissable.
   *
   * Defaults to true
   */
  readonly dismissable?: boolean

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

  /**
   * Whether to only show the tooltip when the tooltip target overflows its
   * bounds. Typically this is used in conjunction with an ellipsis CSS ruleset.
   */
  readonly onlyWhenOverflowed?: boolean

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
  readonly isTargetOverflowed?: ((target: TooltipTarget) => boolean) | boolean

  /**
   * Optional parameter to be able offset the position of the target element
   * relative to the window. This can be useful in scenarios where the target's
   * natural positioning is not already relative to the window such as an
   * element within in iframe.
   */
  readonly tooltipOffset?: DOMRect

  /** Optional parameter for toggle tip behavior.
   *
   * This means that on target click
   * the tooltip will be shown but not on target focus.
   */
  readonly isToggleTip?: boolean

  /** Optional parameter for to open on target click
   *
   * If you are looking for toggle tip behavior (tooltip does not open on
   * focus), use isToggleTip instead.
   */
  readonly openOnTargetClick?: boolean

  /** Open on target focus - typically only tooltips that target an element with
   * ":focus-visible open on focus. This means any time the target it focused it
   * opens." */
  readonly openOnFocus?: boolean

  /** Whether or not an ancestor component is focused, used in case we want
   * the tooltip to be shown when it's focused. Examples of this are how we
   * want to show the tooltip for file status icons when files in the file
   * list are focused.
   */
  readonly ancestorFocused?: boolean

  /** Whether or not to apply the aria-desribedby to the target element.
   *
   * Sometimes the target element maybe something like a button that already has
   * an aria label that is the same as the tooltip content, if so this should be
   * false.
   *
   * Note: If the tooltip does provide more context than the targets accessible
   * label (visual or aria), this should be true.
   *
   * Default: true
   * */
  readonly applyAriaDescribedBy?: boolean
}

interface ITooltipState {
  /** The unique id of the tooltip (when shown)  */
  readonly id?: string

  /** The target element for which to display a tooltip */
  readonly target: TooltipTarget | null

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

export class Tooltip<T extends TooltipTarget> extends React.Component<
  ITooltipProps<T>,
  ITooltipState
> {
  private mouseRect = new DOMRect()

  private mouseOverTarget = false
  private mouseOverTooltip = false
  private showTooltipTimeout: number | null = null
  private hideTooltipTimeout: number | null = null

  private tooltipRef: TooltipTarget | null = null

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
      for (const entry of entries) {
        if (entry.target === this.tooltipRef) {
          const tooltipRect = this.tooltipRef.getBoundingClientRect()
          if (!rectEquals(this.state.tooltipRect, tooltipRect)) {
            this.setState({ tooltipRect })
          }
        } else if (entry.target === this.state.target) {
          const targetRect = this.state.target.getBoundingClientRect()
          if (!rectEquals(this.state.targetRect, targetRect)) {
            this.setState({ targetRect })
          }
        }
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

  public onTargetRef = (target: TooltipTarget | null) => {
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
      this.state.target?.dispatchEvent(
        new CustomEvent('tooltip-shown', { bubbles: true })
      )
      this.resizeObserver.observe(elem)
      if (this.props.interactive === true) {
        elem.addEventListener('mouseenter', this.onTooltipMouseEnter)
        elem.addEventListener('mouseleave', this.onTooltipMouseLeave)
      }
    }

    this.tooltipRef = elem
  }

  private onTooltipMouseEnter = (e: MouseEvent) => {
    this.mouseOverTooltip = true
    this.cancelHideTooltip()
  }
  private onTooltipMouseLeave = (e: MouseEvent) => {
    this.mouseOverTooltip = false
    this.beginHideTooltip()
  }

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
      this.removeTooltip(prevState.target)
      if (target !== null) {
        this.installTooltip(target)
      }
    }

    if (this.state.show !== prevState.show) {
      if (this.state.show && this.props.accessible !== false && this.state.id) {
        this.addToTargetAriaDescribedBy(target)
      } else {
        this.removeFromTargetAriaDescribedBy(target)
      }
    }

    if (prevProps.ancestorFocused !== this.props.ancestorFocused) {
      this.updateBasedOnAncestorFocused()
    }
  }

  private addToTargetAriaDescribedBy(target: TooltipTarget | null) {
    if (
      !target ||
      !this.state.id ||
      this.props.applyAriaDescribedBy === false
    ) {
      return
    }

    const ariaDescribedBy = target.getAttribute('aria-describedby')
    const ariaDescribedByArray = ariaDescribedBy
      ? ariaDescribedBy.split(' ')
      : []
    if (!ariaDescribedByArray.includes(this.state.id)) {
      ariaDescribedByArray.push(this.state.id)
      target.setAttribute('aria-describedby', ariaDescribedByArray.join(' '))
    }
  }

  private removeFromTargetAriaDescribedBy(target: TooltipTarget | null) {
    if (
      !target ||
      !this.state.id ||
      this.props.applyAriaDescribedBy === false
    ) {
      return
    }

    const ariaDescribedBy = target.getAttribute('aria-describedby')
    const ariaDescribedByArray = ariaDescribedBy
      ? ariaDescribedBy.split(' ')
      : []
    const index = ariaDescribedByArray.indexOf(this.state.id)
    if (index === -1) {
      return
    }

    ariaDescribedByArray.splice(index, 1)

    if (ariaDescribedByArray.length === 0) {
      target.removeAttribute('aria-describedby')
    } else {
      target.setAttribute('aria-describedby', ariaDescribedByArray.join(' '))
    }
  }

  private updateBasedOnAncestorFocused() {
    const { target } = this.state
    if (target === null) {
      return
    }

    const { ancestorFocused } = this.props
    if (ancestorFocused === true) {
      this.beginShowTooltip()
    } else if (ancestorFocused === false) {
      this.beginHideTooltip()
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (
      event.key === 'Escape' &&
      this.state.show &&
      this.props.dismissable !== false
    ) {
      event.preventDefault()
      this.beginHideTooltip()
    }
  }

  private installTooltip(elem: TooltipTarget) {
    elem.addEventListener('mouseenter', this.onTargetMouseEnter)
    elem.addEventListener('mouseleave', this.onTargetMouseLeave)
    elem.addEventListener('mousemove', this.onTargetMouseMove)
    elem.addEventListener('mousedown', this.onTargetMouseDown)
    elem.addEventListener('focus', this.onTargetFocus)
    elem.addEventListener('focusin', this.onTargetFocusIn)
    elem.addEventListener('focusout', this.onTargetBlur)
    elem.addEventListener('blur', this.onTargetBlur)
    elem.addEventListener('tooltip-shown', this.onTooltipShown)
    elem.addEventListener('tooltip-hidden', this.onTooltipHidden)
    elem.addEventListener('click', this.onTargetClick)
    elem.addEventListener('keydown', this.onKeyDown)
  }

  private removeTooltip(prevTarget: TooltipTarget | null) {
    if (prevTarget !== null) {
      if (prevTarget.getAttribute('aria-describedby')) {
        this.removeFromTargetAriaDescribedBy(prevTarget)
      }
      prevTarget.removeEventListener('mouseenter', this.onTargetMouseEnter)
      prevTarget.removeEventListener('mouseleave', this.onTargetMouseLeave)
      prevTarget.removeEventListener('mousemove', this.onTargetMouseMove)
      prevTarget.removeEventListener('mousedown', this.onTargetMouseDown)
      prevTarget.removeEventListener('focus', this.onTargetFocus)
      prevTarget.removeEventListener('focusin', this.onTargetFocusIn)
      prevTarget.removeEventListener('focusout', this.onTargetBlur)
      prevTarget.removeEventListener('blur', this.onTargetBlur)
      prevTarget.removeEventListener('click', this.onTargetClick)
      prevTarget.removeEventListener('keydown', this.onKeyDown)
    }
  }

  private updateMouseRect = (event: MouseEvent) => {
    this.mouseRect = new DOMRect(event.clientX - 10, event.clientY - 10, 20, 20)
  }

  private onTargetMouseEnter = (event: MouseEvent) => {
    this.updateMouseRect(event)

    this.mouseOverTarget = true
    this.cancelHideTooltip()
    if (!this.state.show) {
      this.beginShowTooltip()
    }
  }

  private onTargetMouseMove = (event: MouseEvent) => {
    this.updateMouseRect(event)
  }

  private onTargetMouseDown = (event: MouseEvent) => {
    if (!this.props.isToggleTip) {
      this.hideTooltip()
    }
  }

  private onTargetFocus = (event: FocusEvent) => {
    // We only want to show the tooltip if the target was focused as a result of
    // keyboard navigation, see
    // https://developer.mozilla.org/en-US/docs/Web/CSS/:focus-visible
    if (
      this.state.target?.matches(':focus-visible') &&
      !this.props.isToggleTip
    ) {
      this.beginShowTooltip()
    }
  }

  private onTargetClick = (event: FocusEvent) => {
    // We only want to handle click events for toggle tips
    if (
      !this.state.show &&
      (this.props.isToggleTip || this.props.openOnTargetClick)
    ) {
      this.beginShowTooltip()
    }
  }

  /**
   * The focusin event fires when an element has received focus,
   * after the focus event. The two events differ in that focusin bubbles, while
   * focus does not.
   */
  private onTargetFocusIn = (event: FocusEvent) => {
    if (this.props.openOnFocus) {
      this.beginShowTooltip()
    }
  }

  private onTargetBlur = (event: FocusEvent) => {
    if (!this.mouseOverTarget && !this.mouseOverTooltip) {
      this.beginHideTooltip()
    }
  }

  /**
   * Event handler for the custom event 'tooltip-shown'
   *
   * Whenever a tooltip is shown for a target it dispatches the 'tooltip-shown'
   * event on that target element which then bubbles upwards. We use this to
   * know when a tooltip is shown for a child component of a tooltip target
   * such that we can close the parent tooltip.
   */
  private onTooltipShown = (event: Event) => {
    if (event.target !== this.state.target && this.state.show) {
      this.hideTooltip()
    }
  }

  /**
   * Event handler for the custom event 'tooltip-hidden'
   *
   * Whenever a tooltip is shown for a target it dispatches the 'tooltip-shown'
   * event on that target element which then bubbles upwards. We use this to
   * know when a tooltip for a child component gets hidden such that we can
   * show the parent components tooltip again should the mouse still be over
   * the tooltip target.
   */
  private onTooltipHidden = (event: Event) => {
    if (event.target !== this.state.target && this.mouseOverTarget) {
      this.beginShowTooltip()
    }
  }

  private beginShowTooltip() {
    this.cancelShowTooltip()
    this.showTooltipTimeout = window.setTimeout(
      this.showTooltip,
      this.props.delay ?? DefaultTooltipDelay
    )
  }

  private isTargetOverflowed() {
    const { isTargetOverflowed } = this.props
    const { target } = this.state

    if (target === null) {
      return false
    }

    if (isTargetOverflowed === undefined) {
      return target.scrollWidth > target.clientWidth
    }

    if (typeof isTargetOverflowed === 'boolean') {
      return isTargetOverflowed
    }

    return isTargetOverflowed(target)
  }

  private showTooltip = () => {
    this.cancelShowTooltip()

    const { tooltipHost, target } = this.state
    if (tooltipHost === null || target === null) {
      return
    }

    if (this.props.onlyWhenOverflowed && !this.isTargetOverflowed()) {
      return
    }

    this.setState({
      measure: true,
      show: false,
      targetRect: this.getTargetRect(target),
      hostRect: tooltipHost.getBoundingClientRect(),
      windowRect: new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    })
  }

  private getTargetRect(target: TooltipTarget) {
    const { direction, tooltipOffset } = this.props

    return offsetRect(
      direction === undefined ? this.mouseRect : target.getBoundingClientRect(),
      tooltipOffset?.x ?? 0,
      tooltipOffset?.y ?? 0
    )
  }

  private cancelShowTooltip() {
    if (this.showTooltipTimeout !== null) {
      clearTimeout(this.showTooltipTimeout)
      this.showTooltipTimeout = null
    }
  }

  private onTargetMouseLeave = (event: MouseEvent) => {
    this.mouseOverTarget = false
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

    if (this.state.show) {
      this.state.target?.dispatchEvent(
        new CustomEvent('tooltip-hidden', { bubbles: true })
      )
    }

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

    const direction = visible
      ? getDirection(this.props.direction, targetRect, windowRect, tooltipRect)
      : TooltipDirection.SOUTH

    const style: React.CSSProperties = visible
      ? getTooltipPositionStyle(direction, targetRect, hostRect, tooltipRect)
      : { visibility: 'hidden', left: `0px`, top: `0px` }

    const className = classNames('tooltip', this.props.className, {
      interactive: this.props.interactive,
      [`tooltip-${direction}`]: show,
    })

    return (
      <div
        role="tooltip"
        // https://www.digitala11y.com/tooltip-role/
        // https://www.tpgi.com/short-note-on-aria-labelledby-and-aria-describedby/
        aria-hidden="true"
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
    TooltipDirection.NORTH,
    TooltipDirection.NORTH_EAST,
    TooltipDirection.NORTH_WEST,
    TooltipDirection.SOUTH,
    TooltipDirection.SOUTH_EAST,
    TooltipDirection.SOUTH_WEST,
    TooltipDirection.EAST,
    TooltipDirection.WEST,
  ])

  // We'll attempt to honor the desired placement but if it won't fit we'll
  // move it around until it does.
  if (direction !== undefined) {
    if (fits(direction)) {
      return direction
    }

    // Try to respect the desired direction by changing the order
    if (direction.startsWith(TooltipDirection.SOUTH)) {
      candidates = new Set([
        TooltipDirection.SOUTH,
        TooltipDirection.SOUTH_EAST,
        TooltipDirection.SOUTH_WEST,
        ...candidates,
      ])
    } else if (direction.startsWith(TooltipDirection.NORTH)) {
      candidates = new Set([
        TooltipDirection.NORTH,
        TooltipDirection.NORTH_EAST,
        TooltipDirection.NORTH_WEST,
        ...candidates,
      ])
    }

    // We already know it won't fit
    candidates.delete(direction)
  } else {
    // Placement based on mouse position, prefer south east, north east
    candidates = new Set([
      TooltipDirection.SOUTH_EAST,
      TooltipDirection.NORTH_EAST,
      ...candidates,
    ])
  }

  for (const candidate of candidates) {
    if (fits(candidate)) {
      return candidate
    }
  }

  // Fall back to south even though it doesn't fit
  return TooltipDirection.SOUTH
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

  return {
    transform: `translate(${Math.round(r.left)}px, ${Math.round(r.top)}px)`,
  }
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
    case TooltipDirection.NORTH_EAST:
      return new DOMRect(xMid - tip.x - tip.width, yTop - tip.height, w, h)
    case TooltipDirection.NORTH:
      return new DOMRect(xMid - w / 2, yTop - tip.height, w, h)
    case TooltipDirection.NORTH_WEST:
      return new DOMRect(xMid - w + tip.right, yTop - tip.height, w, h)
    case TooltipDirection.EAST:
      return new DOMRect(xRight + tip.width, yMid, w, h)
    case TooltipDirection.SOUTH_EAST:
      return new DOMRect(xMid - tip.x - tip.width, yBotttom + tip.height, w, h)
    case TooltipDirection.SOUTH:
      return new DOMRect(xMid - w / 2, yBotttom + tip.height, w, h)
    case TooltipDirection.SOUTH_WEST:
      return new DOMRect(xMid - w + tip.right, yBotttom + tip.height, w, h)
    case TooltipDirection.WEST:
      return new DOMRect(xLeft - w - tip.width, yMid, w, h)
    default:
      return assertNever(direction, `Unknown direction ${direction}`)
  }
}

const tooltipHostFor = (target: Element | undefined | null) =>
  target?.closest('.tooltip-host') ?? document.body

const stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation()
