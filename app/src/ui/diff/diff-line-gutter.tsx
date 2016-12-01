import * as React from 'react'
import { Diff, DiffHunk, DiffLine, DiffLineType } from '../../models/diff'
import { hoverCssClass, selectedLineClass } from './selection/selection'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'

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

  readonly diff: Diff

  readonly updateHunkHoverState: (hunk: DiffHunk, active: boolean) => void

  readonly isSelectionEnabled: () => boolean

  /**
   * Callback to signal when the mouse button is pressed on this element
   */
  readonly onMouseDown: (index: number, isHunkSelection: boolean) => void

  /**
   * Callback to signal when the mouse is hovering over this element
   */
  readonly onMouseMove: (index: number) => void

  /**
   * Callback to signal when the mouse button is released on this element
   */
  readonly onMouseUp: (index: number) => void
}

// TODO: this doesn't consider mouse events outside the right edge

function isMouseInHunkSelectionZone(ev: MouseEvent): boolean {
  // MouseEvent is not generic, but getBoundingClientRect should be
  // available for all HTML elements
  // docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect

  const element: any = ev.currentTarget
  const offset: ClientRect = element.getBoundingClientRect()
  const relativeLeft = ev.clientX - offset.left

  const edge = offset.width - 10

  return relativeLeft >= edge
}

/** The gutter for a diff's line. */
export class DiffLineGutter extends React.Component<IDiffGutterProps, void> {

  private elem_?: HTMLSpanElement

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

    const isHunkSelection = isMouseInHunkSelectionZone(ev)
    this.updateHoverState(isHunkSelection, true)
  }

  private mouseLeaveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isHunkSelection = isMouseInHunkSelectionZone(ev)
    this.updateHoverState(isHunkSelection, false)
  }

  private updateHoverState(isHunkSelection: boolean, isActive: boolean) {
    if (isHunkSelection) {
      const hunk = this.props.diff.diffHunkForIndex(this.props.index)
      if (!hunk) {
        console.error('unable to find hunk for given line in diff')
        return
      }
      this.props.updateHunkHoverState(hunk, isActive)
    } else {
      this.setHover(isActive)
    }
  }

  private mouseMoveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const hunk = this.props.diff.diffHunkForIndex(this.props.index)
    if (!hunk) {
      console.error('unable to find hunk for given line in diff')
      return
    }

    const isHunkSelection = isMouseInHunkSelectionZone(ev)
    const isSelectionActive = this.props.isSelectionEnabled()

    // selection is not active, perform highlighting based on mouse position
    if (isHunkSelection && isSelectionActive) {
      this.props.updateHunkHoverState(hunk, true)
    } else {
      // clear hunk selection in case hunk was previously higlighted
      this.props.updateHunkHoverState(hunk, false)
      this.setHover(true)
    }

    this.props.onMouseMove(this.props.index)
  }

  private mouseUpHandler = (ev: UIEvent) => {
    ev.preventDefault()

    this.props.onMouseUp(this.props.index)
  }

  private mouseDownHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isHunkSelection = isMouseInHunkSelectionZone(ev)
    this.props.onMouseDown(this.props.index, isHunkSelection)
  }

  private renderEventHandlers = (elem: HTMLSpanElement) => {
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
            ref={this.renderEventHandlers}>
        <span className='diff-line-number before'>{this.props.line.oldLineNumber || ' '}</span>
        <span className='diff-line-number after'>{this.props.line.newLineNumber || ' '}</span>
      </span>
    )
  }
}
