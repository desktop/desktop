import * as React from 'react'
import { DiffHunk, DiffLine, DiffLineType } from '../../models/diff'
import { diffHunkForIndex, findInteractiveDiffRange } from './diff-explorer'
import { hoverCssClass, selectedLineClass } from './selection/selection'
import { assertNever } from '../../lib/fatal-error'
import * as classNames from 'classnames'
import { RangeSelectionSizePixels } from './edge-detection'

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
  readonly hunks: ReadonlyArray<DiffHunk>

  /**
   * Callback to apply hover effect to specific lines in the diff
   */
  readonly updateRangeHoverState: (
    start: number,
    end: number,
    active: boolean
  ) => void

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
  readonly onMouseDown: (
    index: number,
    hunks: ReadonlyArray<DiffHunk>,
    isRangeSelection: boolean
  ) => void

  /**
   * Callback to signal when the mouse is hovering over this element
   */
  readonly onMouseMove: (index: number) => void
}

interface IDiffGutterState {
  /**
   * Whether or not the diff line gutter should render as hovered,
   * i.e. highlighted. This is used when moused over directly or
   * when the hunk that this line is part of is hovered.
   */
  readonly hover: boolean

  /**
   * Whether or not the diff line gutter should render that it's
   * selected, i.e. included for commit.
   */
  readonly selected: boolean
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

  const edge = offset.width - RangeSelectionSizePixels

  return relativeLeft >= edge
}

/** The gutter for a diff's line. */
export class DiffLineGutter extends React.Component<
  IDiffGutterProps,
  IDiffGutterState
> {
  private elem_?: HTMLSpanElement

  public constructor(props: IDiffGutterProps) {
    super(props)

    this.state = {
      hover: false,
      selected: this.props.isIncluded,
    }
  }

  /**
   * Compute the width for the current element
   */
  public getWidth(): number | null {
    if (this.elem_) {
      return this.elem_.clientWidth
    }
    return null
  }

  /**
   * Indicate whether the current gutter element is selected
   */
  public isIncluded(): boolean {
    return this.props.line.isIncludeableLine() && this.state.selected
  }

  /**
   * Set (or unset) the hover styling of the diff gutter
   */
  public setHover(hover: boolean) {
    // only show the hover effect if the line isn't context
    if (!this.props.line.isIncludeableLine()) {
      return
    }

    this.setState({ hover })
  }

  /**
   * Set (or unset) the selected styling of the diff gutter
   */
  public setSelected(selected: boolean) {
    this.setState({ selected })
  }

  private getLineClassName(): string {
    const type = this.props.line.type
    switch (type) {
      case DiffLineType.Add:
        return 'diff-add'
      case DiffLineType.Delete:
        return 'diff-delete'
      case DiffLineType.Context:
        return 'diff-context'
      case DiffLineType.Hunk:
        return 'diff-hunk'
    }

    return assertNever(type, `Unknown DiffLineType ${type}`)
  }

  private getLineClass(): string {
    const lineClass = this.getLineClassName()
    const selectedClass = this.isIncluded() ? selectedLineClass : null
    const hoverClass = this.state.hover ? hoverCssClass : null

    return classNames(
      'diff-line-gutter',
      lineClass,
      selectedClass,
      hoverClass,
      {
        'read-only': this.props.readOnly,
      }
    )
  }

  private updateHoverState(isRangeSelection: boolean, isActive: boolean) {
    if (isRangeSelection) {
      const range = findInteractiveDiffRange(this.props.hunks, this.props.index)
      if (!range) {
        console.error('unable to find range for given index in diff')
        return
      }
      this.props.updateRangeHoverState(range.start, range.end, isActive)
    } else {
      this.setHover(isActive)
    }
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

  private mouseMoveHandler = (ev: MouseEvent) => {
    ev.preventDefault()

    const hunk = diffHunkForIndex(this.props.hunks, this.props.index)
    if (!hunk) {
      console.error('unable to find hunk for given line in diff')
      return
    }

    const isRangeSelection = isMouseCursorNearEdge(ev)
    const isSelectionActive = this.props.isSelectionEnabled()

    const range = findInteractiveDiffRange(this.props.hunks, this.props.index)
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

  private mouseDownHandler = (ev: MouseEvent) => {
    ev.preventDefault()
    const isRangeSelection = isMouseCursorNearEdge(ev)
    this.props.onMouseDown(this.props.index, this.props.hunks, isRangeSelection)
  }

  private applyEventHandlers = (elem: HTMLSpanElement | null) => {
    // set this so we can compute the width of the diff gutter
    // whether it is an editable line or not
    if (elem) {
      this.elem_ = elem
    }

    // read-only diffs do not support any interactivity
    if (this.props.readOnly) {
      return
    }

    // no point handling mouse events on context lines
    if (elem && this.props.line.isIncludeableLine()) {
      elem.addEventListener('mouseenter', this.mouseEnterHandler)
      elem.addEventListener('mouseleave', this.mouseLeaveHandler)
      elem.addEventListener('mousemove', this.mouseMoveHandler)
      elem.addEventListener('mousedown', this.mouseDownHandler)
    } else {
      // this callback fires a second time when the DOM element
      // is unmounted, so we can use this as a chance to cleanup.
      // We unsubscribe without checking for isIncludeableLine since
      // that might have changed underneath us
      if (this.elem_) {
        this.elem_.removeEventListener('mouseenter', this.mouseEnterHandler)
        this.elem_.removeEventListener('mouseleave', this.mouseLeaveHandler)
        this.elem_.removeEventListener('mousemove', this.mouseMoveHandler)
        this.elem_.removeEventListener('mousedown', this.mouseDownHandler)
      }

      this.elem_ = undefined
    }
  }

  public render() {
    const role =
      !this.props.readOnly && this.props.line.isIncludeableLine()
        ? 'button'
        : undefined

    return (
      <span
        className={this.getLineClass()}
        ref={this.applyEventHandlers}
        role={role}
      >
        <span className="diff-line-number before">
          {this.props.line.oldLineNumber || ' '}
        </span>
        <span className="diff-line-number after">
          {this.props.line.newLineNumber || ' '}
        </span>
      </span>
    )
  }
}
