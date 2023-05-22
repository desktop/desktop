import * as React from 'react'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'
import classNames from 'classnames'
import {
  ComputePositionReturn,
  autoUpdate,
  computePosition,
} from '@floating-ui/react-dom'
import {
  arrow,
  flip,
  offset,
  Placement,
  shift,
  Side,
  size,
} from '@floating-ui/core'
import { assertNever } from '../../lib/fatal-error'

/**
 * Position of the popover relative to its anchor element. It's composed by 2
 * dimensions:
 * - The first one is the edge of the anchor element from which the popover will
 *   be displayed.
 * - The second one is the alignment of the popover within that edge.
 *
 * Example: BottomRight means the popover will be in the bottom edge of the
 * anchor element, on its right side.
 **/
export enum PopoverAnchorPosition {
  Top = 'top',
  TopRight = 'top-right',
  TopLeft = 'top-left',
  Left = 'left',
  LeftTop = 'left-top',
  LeftBottom = 'left-bottom',
  Bottom = 'bottom',
  BottomLeft = 'bottom-left',
  BottomRight = 'bottom-right',
  Right = 'right',
  RightTop = 'right-top',
  RightBottom = 'right-bottom',
}

export enum PopoverAppearEffect {
  Shake = 'shake',
}

export enum PopoverDecoration {
  None = 'none',
  Balloon = 'balloon',
}

const TipSize = 8
const TipCornerPadding = TipSize
const ScreenBorderPadding = 10

interface IPopoverProps {
  readonly onClickOutside?: (event?: MouseEvent) => void
  readonly onMousedownOutside?: (event?: MouseEvent) => void
  /** Element to anchor the popover to */
  readonly anchor: HTMLElement | null
  /** The position of the popover relative to the anchor.  */
  readonly anchorPosition: PopoverAnchorPosition
  /**
   * The position of the tip or pointer of the popover relative to the side at
   * which the tip is presented. Optional. Default: Center
   */
  readonly className?: string
  readonly style?: React.CSSProperties
  readonly appearEffect?: PopoverAppearEffect
  readonly ariaLabelledby?: string
  readonly trapFocus?: boolean // Default: true
  readonly decoration?: PopoverDecoration // Default: none

  /** Maximum height decided by clients of Popover */
  readonly maxHeight?: number
  /** Minimum height decided by clients of Popover */
  readonly minHeight?: number
}

interface IPopoverState {
  readonly position: ComputePositionReturn | null
}

export class Popover extends React.Component<IPopoverProps, IPopoverState> {
  private focusTrapOptions: FocusTrapOptions
  private containerDivRef = React.createRef<HTMLDivElement>()
  private contentDivRef = React.createRef<HTMLDivElement>()
  private tipDivRef = React.createRef<HTMLDivElement>()
  private floatingCleanUp: (() => void) | null = null

  public constructor(props: IPopoverProps) {
    super(props)

    this.focusTrapOptions = {
      allowOutsideClick: true,
      escapeDeactivates: true,
      onDeactivate: this.props.onClickOutside,
    }

    this.state = { position: null }
  }

  private async setupPosition() {
    this.floatingCleanUp?.()
    this.floatingCleanUp = null

    const { anchor } = this.props

    if (
      anchor === null ||
      anchor === undefined ||
      this.containerDivRef.current === null
    ) {
      return
    }

    this.floatingCleanUp = autoUpdate(
      anchor,
      this.containerDivRef.current,
      this.updatePosition
    )
  }

  private updatePosition = async () => {
    const { anchor, decoration, maxHeight } = this.props
    const containerDiv = this.containerDivRef.current
    const contentDiv = this.contentDivRef.current

    if (
      anchor === null ||
      anchor === undefined ||
      containerDiv === null ||
      contentDiv === null
    ) {
      return
    }

    const tipDiv = this.tipDivRef.current

    const middleware = [
      offset(decoration === PopoverDecoration.Balloon ? TipSize : 0),
      shift({ padding: ScreenBorderPadding }),
      flip({ padding: ScreenBorderPadding }),
      size({
        apply({ availableHeight, availableWidth }) {
          Object.assign(contentDiv.style, {
            maxHeight:
              maxHeight === undefined
                ? `${availableHeight}px`
                : `${Math.min(availableHeight, maxHeight)}px`,
            maxWidth: `${availableWidth}px`,
          })
        },
        padding: ScreenBorderPadding,
      }),
    ]

    if (decoration === PopoverDecoration.Balloon && tipDiv) {
      middleware.push(arrow({ element: tipDiv, padding: TipCornerPadding }))
    }

    const position = await computePosition(anchor, containerDiv, {
      strategy: 'fixed',
      placement: this.getFloatingPlacementForAnchorPosition(),
      middleware,
    })

    this.setState({ position })
  }

  public componentDidMount() {
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('mousedown', this.onDocumentMouseDown)
    this.setupPosition()
  }

  public componentDidUpdate(prevProps: IPopoverProps) {
    if (prevProps.anchor !== this.props.anchor) {
      this.setupPosition()
    }
  }

  public componentWillUnmount() {
    document.removeEventListener('click', this.onDocumentClick)
    document.removeEventListener('mousedown', this.onDocumentMouseDown)
  }

  private onDocumentClick = (event: MouseEvent) => {
    const ref = this.containerDivRef.current
    const { target } = event

    if (
      ref !== null &&
      ref.parentElement !== null &&
      target instanceof Node &&
      !ref.parentElement.contains(target) &&
      this.props.onClickOutside !== undefined
    ) {
      this.props.onClickOutside(event)
    }
  }

  private onDocumentMouseDown = (event: MouseEvent) => {
    const ref = this.containerDivRef.current
    const { target } = event

    if (
      ref !== null &&
      ref.parentElement !== null &&
      target instanceof Node &&
      !ref.parentElement.contains(target) &&
      this.props.onMousedownOutside !== undefined
    ) {
      this.props.onMousedownOutside(event)
    }
  }

  public render() {
    const {
      trapFocus,
      className,
      appearEffect,
      ariaLabelledby,
      children,
      decoration,
      maxHeight,
      minHeight,
    } = this.props
    const cn = classNames(
      decoration === PopoverDecoration.Balloon && 'popover-component',
      className,
      appearEffect && `appear-${appearEffect}`
    )

    const { position } = this.state
    // Make sure the popover *always* has at least `position: fixed` set, otherwise
    // it can cause weird layout glitches.
    const style: React.CSSProperties = {
      position: 'fixed',
      zIndex: 17, // same as --foldout-z-index
      height: 'auto',
    }
    const contentStyle: React.CSSProperties = {
      overflow: 'hidden',
      width: '100%',
    }
    let tipStyle: React.CSSProperties = {}

    if (position) {
      style.top = position.y === undefined ? undefined : `${position.y}px`
      style.left = position.x === undefined ? undefined : `${position.x}px`
      contentStyle.minHeight =
        minHeight === undefined ? undefined : `${minHeight}px`
      contentStyle.height =
        maxHeight === undefined ? undefined : `${maxHeight}px`

      const arrow = position.middlewareData.arrow

      if (arrow) {
        const side: Side = position.placement.split('-')[0] as Side

        const staticSide = {
          top: 'bottom',
          right: 'left',
          bottom: 'top',
          left: 'right',
        }[side]

        const angle = {
          top: '270deg',
          right: '0deg',
          bottom: '90deg',
          left: '180deg',
        }[side]

        tipStyle = {
          top: arrow.y,
          left: arrow.x,
          transform: `rotate(${angle})`,
          [staticSide]: this.tipDivRef.current
            ? `${-this.tipDivRef.current.offsetWidth}px`
            : undefined,
        }
      }
    }

    const content = (
      <div
        className={cn}
        style={style}
        ref={this.containerDivRef}
        aria-labelledby={ariaLabelledby}
        role="dialog"
      >
        <div
          className="popover-content"
          style={contentStyle}
          ref={this.contentDivRef}
        >
          {children}
        </div>
        {decoration === PopoverDecoration.Balloon && (
          <div
            className="popover-tip"
            style={{
              position: 'absolute',
              width: TipSize * 2,
              height: TipSize * 2,
              ...tipStyle,
            }}
            ref={this.tipDivRef}
          >
            <div
              className="popover-tip-border"
              style={{
                position: 'absolute',
                right: 1,
                width: 0,
                height: 0,
                borderWidth: `${TipSize}px`,
                borderRightWidth: `${TipSize - 1}px`,
              }}
            />
            <div
              className="popover-tip-background"
              style={{
                position: 'absolute',
                right: 0,
                width: 0,
                height: 0,
                borderWidth: `${TipSize}px`,
                borderRightWidth: `${TipSize - 1}px`,
              }}
            />
          </div>
        )}
      </div>
    )

    return trapFocus !== false ? (
      <FocusTrap focusTrapOptions={this.focusTrapOptions}>{content}</FocusTrap>
    ) : (
      content
    )
  }

  private getFloatingPlacementForAnchorPosition(): Placement {
    const { anchorPosition } = this.props
    switch (anchorPosition) {
      case PopoverAnchorPosition.Top:
        return 'top'
      case PopoverAnchorPosition.TopLeft:
        return 'top-start'
      case PopoverAnchorPosition.TopRight:
        return 'top-end'
      case PopoverAnchorPosition.Left:
        return 'left'
      case PopoverAnchorPosition.LeftTop:
        return 'left-start'
      case PopoverAnchorPosition.LeftBottom:
        return 'left-end'
      case PopoverAnchorPosition.Right:
        return 'right'
      case PopoverAnchorPosition.RightTop:
        return 'right-start'
      case PopoverAnchorPosition.RightBottom:
        return 'right-end'
      case PopoverAnchorPosition.Bottom:
        return 'bottom'
      case PopoverAnchorPosition.BottomLeft:
        return 'bottom-start'
      case PopoverAnchorPosition.BottomRight:
        return 'bottom-end'
      default:
        assertNever(anchorPosition, 'Unknown anchor position')
    }
  }
}
