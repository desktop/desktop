import * as React from 'react'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { mouseScroller } from '../../lib/mouse-scroller'
import { sleep } from '../../lib/promise'

interface IDraggableProps {
  /**
   * Callback for when a drag starts - user must hold down (mouse down event)
   * and move the mouse (mouse move event)
   */
  readonly onDragStart: () => void

  /**
   * Callback for when the drag ends - user releases mouse (mouse up event) or
   * mouse goes out of screen
   *
   * @param isOverDropTarget - whether the last element the mouse was over
   * before the mouse up event matches one of the dropTargetSelectors provided
   */
  readonly onDragEnd: (isOverDropTarget: boolean) => void

  /** Callback to render a drag element inside the #dragElement */
  readonly onRenderDragElement: () => void

  /** Callback to remove a drag element inside the #dragElement */
  readonly onRemoveDragElement: () => void

  /** Whether dragging is enabled */
  readonly isEnabled: boolean

  /** An array of css selectors for elements that are valid drop targets. */
  readonly dropTargetSelectors: ReadonlyArray<string>
}

export class Draggable extends React.Component<IDraggableProps> {
  private dragStarted: boolean = false
  private dragElement: HTMLElement | null = null
  private elemBelow: Element | null = null
  // Default offset to place the cursor slightly above the top left corner of
  // the drag element. Note: if placed at (0,0) or cursor is inside the
  // dragElement then elemBelow will always return the dragElement and cannot
  // detect drop targets or scroll elements.
  private verticalOffset: number = __DARWIN__ ? 32 : 15
  private hasMouseUpOccurred = false

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

  /**
   * Invokes the drag event.
   *
   * - clears variables from last drag
   * - sets up mouse move and mouse up listeners
   */
  private onMouseDown = async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!this.canDragCommit(event)) {
      return
    }
    this.hasMouseUpOccurred = false
    document.onmouseup = this.onMouseUp
    await sleep(100)
    if (this.hasMouseUpOccurred) {
      return
    }

    this.initializeDrag()
    document.addEventListener('mousemove', this.onMouseMove)
  }

  /**
   * During drag event
   *
   * Note: A drag is not started until a user moves their mouse. This is
   * important or the drag will start and drag element will render for a user
   * just clicking a draggable element.
   */
  private onMouseMove = (moveEvent: MouseEvent) => {
    if (this.hasMouseUpOccurred) {
      this.onDragEnd()
      return
    }
    // start drag
    if (!this.dragStarted) {
      this.props.onRenderDragElement()
      this.props.onDragStart()
      dragAndDropManager.dragStarted()
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

    if (this.elemBelow === null) {
      mouseScroller.clearScrollTimer()
      return
    }

    mouseScroller.setupMouseScroll(this.elemBelow, moveEvent.clientY)
  }

  /**
   * End a drag event
   */
  private onMouseUp = () => {
    this.hasMouseUpOccurred = true
    if (this.dragStarted) {
      this.onDragEnd()
    }
    document.onmouseup = null
  }

  private onDragEnd(): void {
    document.removeEventListener('mousemove', this.onMouseMove)
    mouseScroller.clearScrollTimer()
    this.props.onRemoveDragElement()
    this.props.onDragEnd(this.isLastElemBelowDropTarget())
    dragAndDropManager.dragEnded()
  }

  /**
   * Compares the last element that the mouse was over during a drag with the
   * css selectors provided in dropTargetSelectors to determine if the drag
   * ended on target or not.
   */
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
