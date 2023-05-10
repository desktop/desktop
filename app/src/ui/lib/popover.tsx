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
export enum PopoverCaretPosition {
  Top = 'top',
  TopRight = 'top-right',
  TopLeft = 'top-left',
  LeftTop = 'left-top',
  LeftBottom = 'left-bottom',
  RightTop = 'right-top',
  None = 'none',
}

export enum PopoverAppearEffect {
  Shake = 'shake',
}

interface IPopoverProps {
  readonly onClickOutside?: (event?: MouseEvent) => void
  readonly onMousedownOutside?: (event?: MouseEvent) => void
  /** The position of the caret or pointer towards the content to which the the
   * popover refers. If the caret position is not provided, the popup will have
   * no caret.  */
  readonly caretPosition?: PopoverCaretPosition
  readonly className?: string
  readonly style?: React.CSSProperties
  readonly appearEffect?: PopoverAppearEffect
  readonly ariaLabelledby?: string

  readonly anchor?: ReferenceType | null
}

interface IPopoverState {
  readonly position: ComputePositionReturn | null
}

export class Popover extends React.Component<IPopoverProps, IPopoverState> {
  private focusTrapOptions: FocusTrapOptions
  private containerDivRef = React.createRef<HTMLDivElement>()

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
    if (
      this.props.anchor === null ||
      this.props.anchor === undefined ||
      this.containerDivRef.current === null
    ) {
      return
    }

    autoUpdate(
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

    const position = await computePosition(
      this.props.anchor,
      this.containerDivRef.current,
      { strategy: 'fixed', placement: 'right-end' }
    )

    this.setState({ position })

    console.log(position)
  }

  public componentDidMount() {
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('mousedown', this.onDocumentMouseDown)
    this.setupPosition()
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
    const cn = classNames(
      'popover-component',
      this.getClassNameForCaret(),
      this.props.className,
      this.props.appearEffect && `appear-${this.props.appearEffect}`
    )

    const { position } = this.state
    const style = position
      ? { top: `${position.y}px`, left: `${position.x}px` }
      : undefined

    return (
      <FocusTrap active={true} focusTrapOptions={this.focusTrapOptions}>
        <div
          className={cn}
          ref={this.containerDivRef}
          style={style}
          aria-labelledby={this.props.ariaLabelledby}
          role="dialog"
        >
          {this.props.children}
        </div>
      </FocusTrap>
    )
  }

  private getClassNameForCaret() {
    return `popover-caret-${
      this.props.caretPosition ?? PopoverCaretPosition.None
    }`
  }
}
