import * as React from 'react'
import { Diff, DiffLine, DiffLineType } from '../../models/diff'
import { hoverCssClass, selectedLineClass } from './selection/selection'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'

/**
 * The area in pixels either side of the right-edge of the diff gutter to
 * use to detect when a group of lines should be highlighted, instead of
 * a single line.
 */
const EdgeDetectionSize = 10

/** The props for the diff gutter. */
interface IDiffGutterProps {
  /** The line being represented by the gutter. */
  readonly line: DiffLine

  /**
   * In the case of a non-readonly line, indicates whether the given line
   * should be rendered as selected or not.
   */
  readonly isIncluded: boolean

  /**
   * The line number relative to the unified diff output
   */
  readonly index: number

  /**
   * Indicate whether the diff should handle user interactions
   */
  readonly readOnly: boolean

  /**
   * The diff currently displayed in the app
   */
  readonly diff: Diff

  /**
   * Callback to apply hover effect to specific lines in the diff
   */
  readonly updateRangeHoverState: (start: number, end: number, active: boolean) => void

  /**
   * Callback to query whether a selection gesture is currently underway
   *
   * If this returns true, the element will attempt to update the hover state.
   * Otherwise, this will defer to the active selection gesture to update
   * the visual state of the gutter.
   */
  readonly isSelectionEnabled: () => boolean

  /**
   * Callback to signal when the mouse button is pressed on this element
   */
  readonly onMouseDown: (index: number, isRangeSelection: boolean) => void

  /**
   * Callback to signal when the mouse is hovering over this element
   */
  readonly onMouseMove: (index: number) => void

  /**
   * Callback to signal when the mouse button is released on this element
   */
  readonly onMouseUp: (index: number) => void
}

/**
 * Detect if mouse cursor is within the range
 */
function isMouseCursorNearEdge(ev: MouseEvent): boolean {
  // MouseEvent is not generic, but getBoundingClientRect should be
  // available for all HTML elements
  // docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect

  const element: any = ev.currentTarget
  const offset: ClientRect = element.getBoundingClientRect()
  const relativeLeft = ev.clientX - offset.left

  const edge = offset.width - EdgeDetectionSize

  return relativeLeft >= edge
}

/** The gutter for a diff's line. */
export class DiffLineGutter extends React.Component<IDiffGutterProps, void> {

  private elem_?: HTMLSpanElement

  public getWidth = (): number | null => {
    if (this.elem_) {
      return this.elem_.clientWidth
    }
    return null
  }

  private getLineClassName(): string {
    const type = this.props.line.type
    switch (type) {
      case DiffLineType.Add: return 'diff-add'
      case DiffLineType.Delete: return 'diff-delete'
      case DiffLineType.Context: return 'diff-context'
      case DiffLineType.Hunk: return 'diff-hunk'
    }

    return assertNever(type, `Unknown DiffLineType ${type}`)
  }

  private getLineClass(): string {
    const lineClass = this.getLineClassName()
    const selectedClass = this.isIncluded() ? selectedLineClass : null

    return classNames('diff-line-gutter', lineClass, selectedClass)
  }

  private mouseEnterHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isRangeSelection = isMouseCursorNearEdge(ev)

    this.updateHoverState(isRangeSelection, true)
  }

  private mouseLeaveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isRangeSelection = isMouseCursorNearEdge(ev)
    this.updateHoverState(isRangeSelection, false)
  }

  private updateHoverState(isRangeSelection: boolean, isActive: boolean) {
    if (isRangeSelection) {
      const range = this.props.diff.findInteractiveDiffRange(this.props.index)
      if (!range) {
        console.error('unable to find range for given index in diff')
        return
      }
      this.props.updateRangeHoverState(range.start, range.end, isActive)
    } else {
      this.setHover(isActive)
    }
  }

  private mouseMoveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isRangeSelection = isMouseCursorNearEdge(ev)
    const isSelectionActive = this.props.isSelectionEnabled()

    const range = this.props.diff.findInteractiveDiffRange(this.props.index)
    if (!range) {
      console.error('unable to find range for given index in diff')
      return
    }

    // selection is not active, perform highlighting based on mouse position
    if (isRangeSelection && range && isSelectionActive) {
      this.props.updateRangeHoverState(range.start, range.end, true)
    } else {
      // clear range selection in case range was previously higlighted
      this.props.updateRangeHoverState(range.start, range.end, false)
      this.setHover(true)
    }

    this.props.onMouseMove(this.props.index)
  }

  private mouseUpHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    this.props.onMouseUp(this.props.index)
  }

  private mouseDownHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isRangeSelection = isMouseCursorNearEdge(ev)
    this.props.onMouseDown(this.props.index, isRangeSelection)
  }

  private applyEventHandlers = (elem: HTMLSpanElement) => {
    // read-only diffs do not support any interactivity
    if (this.props.readOnly) {
      return
    }

    // ignore anything from diff context rows
    if (!this.props.line.isIncludeableLine()) {
      return
    }

    if (elem) {
      this.elem_ = elem

      elem.addEventListener('mouseenter', this.mouseEnterHandler)
      elem.addEventListener('mouseleave', this.mouseLeaveHandler)
      elem.addEventListener('mousemove', this.mouseMoveHandler)
      elem.addEventListener('mousedown', this.mouseDownHandler)
      elem.addEventListener('mouseup', this.mouseUpHandler)
    } else {

      // this callback fires a second time when the DOM element
      // is unmounted, so we can use this as a chance to cleanup

      if (this.elem_) {
        this.elem_.removeEventListener('mouseenter', this.mouseEnterHandler)
        this.elem_.removeEventListener('mouseleave', this.mouseLeaveHandler)
        this.elem_.removeEventListener('mousemove', this.mouseMoveHandler)
        this.elem_.removeEventListener('mousedown', this.mouseDownHandler)
        this.elem_.removeEventListener('mouseup', this.mouseUpHandler)
      }

      this.elem_ = undefined
    }
  }

  public isIncluded(): boolean {
    return this.props.line.isIncludeableLine() && this.props.isIncluded
  }

  public setHover(visible: boolean) {
    if (visible) {
      this.setClass(hoverCssClass)
    } else {
      this.unsetClass(hoverCssClass)
    }
  }

  public setSelected(visible: boolean) {
    if (visible) {
      this.setClass(selectedLineClass)
    } else {
      this.unsetClass(selectedLineClass)
    }
  }

  private setClass(cssClass: string) {
    if (this.elem_) {
      this.elem_.classList.add(cssClass)
    }
  }

  private unsetClass(cssClass: string) {
    if (this.elem_) {
      this.elem_.classList.remove(cssClass)
    }
  }

  public render() {
    return (
      <span className={this.getLineClass()}
            ref={this.applyEventHandlers}>
        <span className='diff-line-number before'>{this.props.line.oldLineNumber || ' '}</span>
        <span className='diff-line-number after'>{this.props.line.newLineNumber || ' '}</span>
      </span>
    )
  }
}
