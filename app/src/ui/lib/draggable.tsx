import * as React from 'react'

interface IDraggableProps {
  readonly onDragStart: () => void
  readonly onDragEnd: (isOverDropTarget: boolean) => void
  readonly onRenderDragElement: () => void
  readonly onRemoveDragElement: () => void
  readonly isEnabled: boolean
  readonly dropZoneSelectors: ReadonlyArray<string>
}
export class Draggable extends React.Component<IDraggableProps> {
  private dragStarted: boolean = false
  private dragElement: HTMLElement | null = null
  private verticalOffset: number = __DARWIN__ ? 32 : 15
  private isOverDropTarget: boolean = false

  public componentDidMount() {
    this.dragStarted = false
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
    // reset drag variables
    this.dragStarted = false
    this.isOverDropTarget = false
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
      this.props.onDragEnd(this.isOverDropTarget)
    }
  }

  private onMouseMove = (moveEvent: MouseEvent) => {
    if (!this.dragStarted) {
      this.props.onRenderDragElement()
      this.props.onDragStart()
      this.dragStarted = true
    }

    if (this.dragElement !== null) {
      this.dragElement.style.left = moveEvent.pageX + 0 + 'px'
      this.dragElement.style.top = moveEvent.pageY + this.verticalOffset + 'px'
    }

    // inspect element mouse is is hovering over
    const elemBelow = document.elementFromPoint(
      moveEvent.clientX,
      moveEvent.clientY
    )

    // mouse left the screen
    if (elemBelow === null) {
      return
    }

    this.isOverDropTarget =
      this.props.dropZoneSelectors.find(dsz => {
        const dzel = elemBelow.closest(dsz)
        return dzel !== null
      }) !== undefined
  }

  public render() {
    return (
      <div className="draggable" onMouseDown={this.onMouseDown}>
        {this.props.children}
      </div>
    )
  }
}
