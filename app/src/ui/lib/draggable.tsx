import * as React from 'react'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { mouseScroller } from '../../lib/mouse-scroller'
import { sleep } from '../../lib/promise'
import { DropTargetSelector } from '../../models/drag-drop'

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
   * @param dropTargetSelector - if the last element the mouse was over
   * before the mouse up event matches one of the dropTargetSelectors provided,
   * it is that selector enum
   */
  readonly onDragEnd?: (
    dropTargetSelector: DropTargetSelector | undefined
  ) => void

  /** Callback to render a drag element inside the #dragElement */
  readonly onRenderDragElement: () => void

  /** Callback to remove a drag element inside the #dragElement */
  readonly onRemoveDragElement: () => void

  /** Whether dragging is enabled */
  readonly isEnabled: boolean

  /** An array of css selectors for elements that are valid drop targets. */
  readonly dropTargetSelectors: ReadonlyArray<DropTargetSelector>
}

export class Draggable extends React.Component<IDraggableProps> {
  private hasDragStarted: boolean = false
  private hasDragEnded: boolean = false
  private dragElement: HTMLElement | null = null
  private elemBelow: Element | null = null
  // Default offset to place the cursor slightly above the top left corner of
  // the drag element. Note: if placed at (0,0) or cursor is inside the
  // dragElement then elemBelow will always return the dragElement and cannot
  // detect drop targets or scroll elements.
  private verticalOffset: number = __DARWIN__ ? 32 : 15

  public componentDidMount() {
    this.dragElement = document.getElementById('dragElement')
  }

  /**
   * A user can drag a commit if they are holding down the left mouse button or
   * event.button === 0
   *
   * Exceptions:
   *  - macOS allow emulating a right click by holding down the ctrl and left
   *    mouse button.
   *  - user can not drag during a shift click
   *
   * All other MouseEvent.button values are:
   * 2: right button/pen barrel button
   * 1: middle button
   * X1, X2: mouse back/forward buttons
   * 5: pen eraser
   * -1: No button changed
   *
   * Ref: https://www.w3.org/TR/pointerevents/#the-button-property
   *
   * */
  private canDragCommit(event: React.MouseEvent<HTMLDivElement>): boolean {
    const isSpecialClick =
      event.button !== 0 ||
      (__DARWIN__ && event.button === 0 && event.ctrlKey) ||
      event.shiftKey

    return !isSpecialClick && this.props.isEnabled
  }

  private initializeDrag(): void {
    this.hasDragStarted = false
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
    this.hasDragEnded = false
    document.onmouseup = this.handleDragEndEvent
    await sleep(100)
    if (this.hasDragEnded) {
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
    if (this.hasDragEnded) {
      this.onDragEnd()
      return
    }
    // start drag
    if (!this.hasDragStarted) {
      this.props.onRenderDragElement()
      this.props.onDragStart()
      dragAndDropManager.dragStarted()
      this.hasDragStarted = true
      window.addEventListener('keyup', this.onKeyUp)
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
  private handleDragEndEvent = () => {
    this.hasDragEnded = true
    if (this.hasDragStarted) {
      this.onDragEnd()
    }
    document.onmouseup = null
    window.removeEventListener('keyup', this.onKeyUp)
  }

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') {
      return
    }
    this.handleDragEndEvent()
  }

  private onDragEnd(): void {
    document.removeEventListener('mousemove', this.onMouseMove)
    mouseScroller.clearScrollTimer()
    this.props.onRemoveDragElement()
    if (this.props.onDragEnd !== undefined) {
      this.props.onDragEnd(this.getLastElemBelowDropTarget())
    }
    dragAndDropManager.dragEnded(this.getLastElemBelowDropTarget())
  }

  /**
   * Compares the last element that the mouse was over during a drag with the
   * css selectors provided in dropTargetSelectors to determine if the drag
   * ended on target or not.
   */
  private getLastElemBelowDropTarget = (): DropTargetSelector | undefined => {
    if (this.elemBelow === null) {
      return
    }

    return this.props.dropTargetSelectors.find(dts => {
      return this.elemBelow !== null && this.elemBelow.closest(dts) !== null
    })
  }

  public render() {
    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div className="draggable" onMouseDown={this.onMouseDown}>
        {this.props.children}
      </div>
    )
  }
}
