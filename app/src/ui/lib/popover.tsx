import * as React from 'react'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'
import classNames from 'classnames'
import {
  ComputePositionReturn,
  ReferenceType,
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
 * Position of the caret relative to the pop up. It's composed by 2 dimensions:
 * - The first one is the edge on which the caret will rest.
 * - The second one is the alignment of the caret within that edge.
 *
 * Example: TopRight means the caret will be in the top edge, on its right side.
 *
 * **Note:** If new positions are added to this enum, the value given to them
 * is prepended with `popover-caret-` to create a class name which defines, in
 * `app/styles/ui/_popover.scss`, where the caret is located for that specific
 * position.
 **/
export enum PopoverAnchorPosition {
  Top = 'top',
  TopRight = 'top-right',
  TopLeft = 'top-left',
  LeftTop = 'left-top',
  LeftBottom = 'left-bottom',
  Bottom = 'bottom',
  RightTop = 'right-top',
  Right = 'right',
}

export enum PopoverAppearEffect {
  Shake = 'shake',
}

const CaretSize = 8

interface IPopoverProps {
  readonly onClickOutside?: (event?: MouseEvent) => void
  readonly onMousedownOutside?: (event?: MouseEvent) => void
  /** The position of the caret or pointer towards the content to which the the
   * popover refers. If the caret position is not provided, the popup will have
   * no caret.  */
  readonly anchorPosition: PopoverAnchorPosition
  readonly className?: string
  readonly style?: React.CSSProperties
  readonly appearEffect?: PopoverAppearEffect
  readonly ariaLabelledby?: string
  readonly trapFocus?: boolean // Default: true
  readonly showCaret?: boolean // Default: true

  readonly maxHeight?: number
  readonly minHeight?: number

  readonly anchor?: ReferenceType | null
}

interface IPopoverState {
  readonly position: ComputePositionReturn | null
}

export class Popover extends React.Component<IPopoverProps, IPopoverState> {
  private focusTrapOptions: FocusTrapOptions
  private containerDivRef = React.createRef<HTMLDivElement>()
  private caretDivRef = React.createRef<HTMLDivElement>()
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
    console.log('HOLA', this.props.anchor, this.containerDivRef.current)

    if (
      this.props.anchor === null ||
      this.props.anchor === undefined ||
      this.containerDivRef.current === null
    ) {
      return
    }

    console.log('ADIOS')

    this.floatingCleanUp = autoUpdate(
      this.props.anchor,
      this.containerDivRef.current,
      this.updatePosition
    )
  }

  private updatePosition = async () => {
    if (
      this.props.anchor === null ||
      this.props.anchor === undefined ||
      this.containerDivRef.current === null
    ) {
      return
    }

    const containerDiv = this.containerDivRef.current
    const caretDiv = this.caretDivRef.current
    const maxHeight = this.props.maxHeight

    const middleware = [
      offset(CaretSize),
      shift(),
      flip(),
      size({
        apply({ availableHeight, availableWidth }) {
          Object.assign(containerDiv.style, {
            maxHeight:
              maxHeight === undefined
                ? `${availableHeight}px`
                : `${Math.min(availableHeight, maxHeight)}px`,
            maxWidth: `${availableWidth}px`,
          })
        },
        padding: 5,
      }),
    ]

    if (this.props.showCaret !== false && caretDiv) {
      middleware.push(arrow({ element: caretDiv }))
    }

    console.log(
      'popover rect',
      this.containerDivRef.current.getBoundingClientRect()
    )

    console.log('anchor rect', this.props.anchor.getBoundingClientRect())

    const position = await computePosition(
      this.props.anchor,
      this.containerDivRef.current,
      {
        strategy: 'fixed',
        placement: this.getFloatingPlacementForAnchorPosition(),
        middleware,
      }
    )

    this.setState({ position })

    console.log(position)
  }

  public componentDidMount() {
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('mousedown', this.onDocumentMouseDown)
    this.setupPosition()
  }

  // in component did update check if anchor changed, and if so setup position again
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
    const { current: ref } = this.containerDivRef
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
    const { current: ref } = this.containerDivRef
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
      showCaret,
      minHeight,
    } = this.props
    const cn = classNames(
      'popover-component',
      this.getClassNameForCaret(),
      className,
      appearEffect && `appear-${appearEffect}`
    )

    const { position } = this.state
    let style: React.CSSProperties | undefined = undefined
    let caretStyle: React.CSSProperties = {}

    if (position) {
      style = {
        position: 'fixed',
        top: position.y === undefined ? undefined : `${position.y}px`,
        left: position.x === undefined ? undefined : `${position.x}px`,
        height: minHeight === undefined ? undefined : `${minHeight}px`,
        zIndex: 1000,
      }

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

        caretStyle = {
          top: arrow.y,
          left: arrow.x,
          transform: `rotate(${angle})`,
          [staticSide]: this.caretDivRef.current
            ? `${-this.caretDivRef.current.offsetWidth}px`
            : undefined,
        }
      }
    }

    return (
      <FocusTrap
        active={trapFocus !== false}
        focusTrapOptions={this.focusTrapOptions}
      >
        <div
          className={cn}
          style={style}
          ref={this.containerDivRef}
          aria-labelledby={ariaLabelledby}
          role="dialog"
        >
          {children}
          {showCaret !== false && (
            <div
              className="popover-tip"
              style={{
                position: 'absolute',
                width: CaretSize * 2,
                height: CaretSize * 2,
                ...caretStyle,
              }}
              ref={this.caretDivRef}
            >
              <div
                className="popover-tip-border"
                style={{
                  position: 'absolute',
                  right: 0,
                  width: 0,
                  height: 0,
                  borderWidth: `${CaretSize}px`,
                  borderRightWidth: `${CaretSize}px`,
                }}
                ref={this.caretDivRef}
              />
              <div
                className="popover-tip-background"
                style={{
                  position: 'absolute',
                  right: -1,
                  width: 0,
                  height: 0,
                  borderWidth: `${CaretSize}px`,
                  borderRightWidth: `${CaretSize - 1}px`,
                }}
                ref={this.caretDivRef}
              />
            </div>
          )}
        </div>
      </FocusTrap>
    )
  }

  private getClassNameForCaret() {
    return `popover-caret-${this.props.anchorPosition}`
  }

  private getFloatingPlacementForAnchorPosition(): Placement {
    if (1 !== NaN) {
      // return 'left'
    }
    const { anchorPosition } = this.props
    switch (anchorPosition) {
      case PopoverAnchorPosition.Top:
        return 'top'
      case PopoverAnchorPosition.TopLeft:
        return 'top-start'
      case PopoverAnchorPosition.TopRight:
        return 'top-end'
      case PopoverAnchorPosition.LeftTop:
        return 'left-start'
      case PopoverAnchorPosition.LeftBottom:
        return 'left-end'
      case PopoverAnchorPosition.RightTop:
        return 'right-start'
      case PopoverAnchorPosition.Right:
        return 'right'
      case PopoverAnchorPosition.Bottom:
        return 'bottom'
      default:
        assertNever(anchorPosition, 'Unknown anchor position')
    }
  }
}
