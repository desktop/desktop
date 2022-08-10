import * as React from 'react'
import FocusTrap from 'focus-trap-react'
import { Options as FocusTrapOptions } from 'focus-trap'
import classNames from 'classnames'

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
}

export enum PopoverAppearEffect {
  Shake = 'shake',
}

interface IPopoverProps {
  readonly onClickOutside?: (event?: MouseEvent) => void
  readonly onMousedownOutside?: (event?: MouseEvent) => void
  readonly caretPosition: PopoverCaretPosition
  readonly className?: string
  readonly style?: React.CSSProperties
  readonly appearEffect?: PopoverAppearEffect
}

export class Popover extends React.Component<IPopoverProps> {
  private focusTrapOptions: FocusTrapOptions
  private containerDivRef = React.createRef<HTMLDivElement>()

  public constructor(props: IPopoverProps) {
    super(props)

    this.focusTrapOptions = {
      allowOutsideClick: true,
      escapeDeactivates: true,
      onDeactivate: this.props.onClickOutside,
    }
  }

  public componentDidMount() {
    document.addEventListener('click', this.onDocumentClick)
    document.addEventListener('mousedown', this.onDocumentMouseDown)
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

    return (
      <FocusTrap active={true} focusTrapOptions={this.focusTrapOptions}>
        <div className={cn} ref={this.containerDivRef} style={this.props.style}>
          {this.props.children}
        </div>
      </FocusTrap>
    )
  }

  private getClassNameForCaret() {
    return `popover-caret-${this.props.caretPosition}`
  }
}
