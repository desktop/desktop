import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'
import { DiffLineGutter } from '../diff-line-gutter'
import { compare } from '../../../lib/compare'
import { range } from '../../../lib/range'

/** apply a drag-and-drop change to the current diff */
export class DragDropSelection implements ISelectionStrategy {
  private readonly start: number
  private readonly desiredSelection: boolean
  private readonly snapshot: DiffSelection

  // the current row the cursor is hovering over
  private current: number

  // to track the gesture range so that we repaint over the
  // entire range of elements while the gesture is in-flight
  private maximumDirtyRange: number
  private minimumDirtyRange: number

  public constructor(
    start: number,
    desiredSelection: boolean,
    snapshot: DiffSelection
  ) {
    this.start = start
    this.desiredSelection = desiredSelection
    this.snapshot = snapshot

    this.current = start
    this.maximumDirtyRange = start
    this.minimumDirtyRange = start
  }

  /**
   * Return the lower bounds of the selection range
   */
  public get lowerIndex(): number {
    if (this.start <= this.current) {
      return this.start
    }

    return this.current
  }

  /**
   * Return the upper bounds of the selection range
   */
  public get upperIndex(): number {
    if (this.start <= this.current) {
      return this.current
    }

    return this.start
  }

  public get length(): number {
    return this.upperIndex - this.lowerIndex + 1
  }

  /**
   * update the selection strategy with the row the user's cursor is over
   */
  public update(current: number) {
    this.current = current

    if (current > this.maximumDirtyRange) {
      this.maximumDirtyRange = current
    }

    if (current < this.minimumDirtyRange) {
      this.minimumDirtyRange = current
    }
  }

  /**
   * apply the selection strategy result to the current diff
   */
  public done(): DiffSelection {
    const newSelection = this.snapshot.withRangeSelection(
      this.lowerIndex,
      this.length,
      this.desiredSelection
    )

    return newSelection
  }

  /**
   * Compute the range of lines to repaint, based on how far the user
   * has moved their cursor
   */
  private determineDirtyRange(
    elements: Map<number, DiffLineGutter>
  ): { start: number; end: number } {
    // as user can go back and forth when doing drag-and-drop, we should
    // update rows outside the current selected range

    // keys are by default sorted by insertion order
    // source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Map/keys
    //
    // this ensures we get the latest index that's drawn onscreen
    const sortedKeys = Array.from(elements.keys()).sort(compare)
    const lastKey = sortedKeys[sortedKeys.length - 1]
    const maximum = lastKey

    let start = this.lowerIndex
    // ensure we repaint over previously touched rows before the start
    if (this.minimumDirtyRange < start) {
      start = this.minimumDirtyRange - 1
    }

    if (start < 1) {
      start = 1 // 0 is always the diff context
    }

    let end = this.upperIndex + 1
    // ensure we repaint over previously touched rows after the end
    if (this.maximumDirtyRange > end) {
      end = this.maximumDirtyRange + 1
    }

    // ensure that we stay within the range of rows painted
    if (end > maximum) {
      end = maximum
    }

    return { start, end }
  }

  /**
   * repaint the current diff gutter to visualize the current state
   */
  public paint(elements: Map<number, DiffLineGutter>) {
    const { start, end } = this.determineDirtyRange(elements)

    // range is not inclusive of the last number, which means the edge of
    // the diff may not be updated - that's why we're adding one here
    range(start, end + 1).forEach(row => {
      const element = elements.get(row)
      if (!element) {
        console.error('expected gutter element not found')
        return
      }

      // don't select the line if it's part of the context
      if (!element.props.line.isIncludeableLine()) {
        return
      }

      const selected = this.getIsSelected(row)
      element.setSelected(selected)
    })
  }

  /**
   * compute the selected state for a given row, based on the current gesture
   * values inside the range pick up the desired value, and values
   * outside the range revert to the initially selected state
   */
  private getIsSelected(index: number): boolean {
    // if we're in the diff range, use the stored value
    if (index >= this.lowerIndex && index <= this.upperIndex) {
      return this.desiredSelection
    }

    // otherwise, just use whatever the old value was
    return this.snapshot.isSelected(index)
  }

  public isIncluded(index: number) {
    return index >= this.lowerIndex && index <= this.upperIndex
      ? this.desiredSelection
      : this.snapshot.isSelected(index)
  }
}
