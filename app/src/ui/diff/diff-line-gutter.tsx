import * as React from 'react'
import { DiffLine, DiffLineType } from '../../models/diff'
import { selectedLineClass } from './selection/selection'
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

  readonly index: number

  readonly readOnly: boolean

  readonly onMouseUp: (index: number) => void

  readonly onMouseDown: (index: number, isHunkSelection: boolean) => void

  readonly onMouseMove: (index: number, isHunkSelection: boolean) => void

  readonly onMouseLeave: (index: number, isHunkSelection: boolean) => void

  readonly onMouseEnter: (index: number, isHunkSelection: boolean) => void
}

/** The gutter for a diff's line. */
export class DiffLineGutter extends React.Component<IDiffGutterProps, void> {
  /** Can this line be selected for inclusion/exclusion? */
  private isIncludableLine(): boolean {
    return this.props.line.type === DiffLineType.Add || this.props.line.type === DiffLineType.Delete
  }

  private isIncluded(): boolean {
    return this.isIncludableLine() && this.props.isIncluded
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

  // TODO: this doesn't consider mouse events outside the right edge

  private isMouseInHunkSelectionZone(ev: MouseEvent): boolean {
    // MouseEvent is not generic, but getBoundingClientRect should be
    // available for all HTML elements
    // docs: https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect

    const element: any = ev.currentTarget
    const offset: ClientRect = element.getBoundingClientRect()
    const relativeLeft = ev.clientX - offset.left

    const edge = offset.width - 10

    return relativeLeft >= edge
  }

  private isIncludeable(): boolean {
    const type = this.props.line.type
    return type === DiffLineType.Add || type === DiffLineType.Delete
  }

  private mouseEnterHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isHunkSelection = this.isMouseInHunkSelectionZone(ev)

    this.props.onMouseEnter(this.props.index, isHunkSelection)
  }

  private mouseLeaveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isHunkSelection = this.isMouseInHunkSelectionZone(ev)

    this.props.onMouseLeave(this.props.index, isHunkSelection)
  }

  private mouseMoveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isHunkSelection = this.isMouseInHunkSelectionZone(ev)

    this.props.onMouseMove(this.props.index, isHunkSelection)
  }

  private mouseUpHandler = (ev: UIEvent) => {
    ev.preventDefault()

    this.props.onMouseUp(this.props.index)
  }

  private mouseDownHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const isHunkSelection = this.isMouseInHunkSelectionZone(ev)

    this.props.onMouseDown(this.props.index, isHunkSelection)
  }

  private elem_: HTMLSpanElement | undefined

  private renderEventHandlers = (elem: HTMLSpanElement) => {
    if (this.props.readOnly) {
      return
    }

    // ignoring anything from diff context rows
    if (!this.isIncludeable()) {
      return
    }


    this.elem_ = elem

    elem.addEventListener('mouseenter', this.mouseEnterHandler)
    elem.addEventListener('mouseleave', this.mouseLeaveHandler)
    elem.addEventListener('mousemove', this.mouseMoveHandler)
    elem.addEventListener('mousedown', this.mouseDownHandler)
    elem.addEventListener('mouseup', this.mouseUpHandler)
  }

  public cleanup() {
    if (this.props.readOnly) {
      return
    }

    // ignoring anything from diff context rows
    if (!this.isIncludeable()) {
      return
    }

    if (this.elem_) {
      this.elem_.removeEventListener('mouseenter', this.mouseEnterHandler)
      this.elem_.removeEventListener('mouseleave', this.mouseLeaveHandler)
      this.elem_.removeEventListener('mousemove', this.mouseMoveHandler)
      this.elem_.removeEventListener('mousedown', this.mouseDownHandler)
      this.elem_.removeEventListener('mouseup', this.mouseUpHandler)
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
