import * as React from 'react'

interface IDraggableProps {
  readonly onDragStart: () => void
  readonly onDragEnd: (isOverDropTarget: boolean) => void
  readonly onRenderDragElement: () => void
  readonly onRemoveDragElement: () => void
  readonly isEnabled: boolean
  readonly dropTargetSelectors: ReadonlyArray<string>
}
export class Draggable extends React.Component<IDraggableProps> {
  private dragStarted: boolean = false
  private dragElement: HTMLElement | null = null
  private verticalOffset: number = __DARWIN__ ? 32 : 15
  private elemBelow: Element | null = null

  public componentDidMount() {
    this.dragElement = document.getElementById('dragElement')
  }

  private canDragCommit(event: React.MouseEvent<HTMLDivElement>): boolean {
    // right clicks or shift clicks
    const isSpecialClick =
      event.button === 2 ||
      (__DARWIN__ && event.button === 0 && event.ctrlKey) ||
      event.shiftKey

    return !isSpecialClick && this.props.isEnabled
  }

  private initializeDrag(): void {
    this.dragStarted = false
    this.elemBelow = null
  }

  private onMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!this.canDragCommit(event)) {
      return
    }
    this.initializeDrag()

    document.addEventListener('mousemove', this.onMouseMove)

    document.onmouseup = e => {
      document.removeEventListener('mousemove', this.onMouseMove)
      document.onmouseup = null
      this.props.onRemoveDragElement()

      this.props.onDragEnd(this.isLastElemBelowDropTarget())
    }
  }

  private onMouseMove = (moveEvent: MouseEvent) => {
    // start drag
    if (!this.dragStarted) {
      this.props.onRenderDragElement()
      this.props.onDragStart()
      this.dragStarted = true
    }

    // move drag element where mouse is
    if (this.dragElement !== null) {
      this.dragElement.style.left = moveEvent.pageX + 0 + 'px'
      this.dragElement.style.top = moveEvent.pageY + this.verticalOffset + 'px'
    }

    // inspect element mouse is is hovering over
    this.elemBelow = document.elementFromPoint(
      moveEvent.clientX,
      moveEvent.clientY
    )
  }

  private isLastElemBelowDropTarget = (): boolean => {
    if (this.elemBelow === null) {
      return false
    }

    const foundDropTarget = this.props.dropTargetSelectors.find(dts => {
      return this.elemBelow !== null && this.elemBelow.closest(dts) !== null
    })

    return foundDropTarget !== undefined
  }

  public render() {
    return (
      <div className="draggable" onMouseDown={this.onMouseDown}>
        {this.props.children}
      </div>
    )
  }
}
