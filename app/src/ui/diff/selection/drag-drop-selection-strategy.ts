import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'
import { selectedLineClass } from './selection'
import { range } from '../../../lib/range'

/** apply a drag-and-drop change to the current diff */
export class DragDropSelection implements ISelectionStrategy {
  private readonly start: number
  private readonly desiredSelection: boolean
  private readonly snapshot: DiffSelection

  private current: number

  public constructor(start: number, desiredSelection: boolean, snapshot: DiffSelection) {
    this.start = start
    this.desiredSelection = desiredSelection
    this.snapshot = snapshot

    this.current = start
  }

  /**
   * Return the lower bounds of the selection range
   */
  private get lowerIndex(): number {
    if (this.start <= this.current) {
      return this.start
    }

    return this.current
  }

  /**
   * Return the upper bounds of the selection range
   */
  private get upperIndex(): number {
    if (this.start <= this.current) {
      return this.current
    }

    return this.start
  }

  /**
   * Return the index associated with the start of this gesture
   */
  public get initialIndex(): number {
      return this.start
  }

  /**
   * update the selection strategy with the row the user's cursor is over
   */
  public update(current: number) {
    this.current = current
  }

  /**
   * apply the selection strategy result to the current diff
   */
  public apply(onIncludeChanged: (diffSelection: DiffSelection) => void) {
    const length = (this.upperIndex - this.lowerIndex) + 1

    const newSelection = this.snapshot.withRangeSelection(
      this.lowerIndex,
      length,
      this.desiredSelection)

    onIncludeChanged(newSelection)
  }

  /**
   * repaint the current diff gutter to visualize the current state
   */
  public paint(elements: Map<number, HTMLSpanElement>) {

    // as user can go back and forth when doing drag-and-drop, we should
    // update rows outside the current selected range
    let start = this.lowerIndex
    if (start < 1) {
      start = 1 // 0 is always the diff context
    }

    const maximum = elements.size
    let end = this.upperIndex + 1
    if (end >= maximum) {
      end = maximum - 1 // ensure that we stay within the diff bounds
    }

    range(start, end).forEach(row => {
      const element = elements.get(row)
      if (!element) {
        console.error('expected gutter element not found')
        return
      }

      const selected = this.getIsSelected(row)
      const childSpan = element.children[0] as HTMLSpanElement
      if (!childSpan) {
        console.error('expected DOM element for diff gutter not found')
        return
      }

      if (selected) {
        childSpan.classList.add(selectedLineClass)
      } else {
        childSpan.classList.remove(selectedLineClass)
      }
    })
  }

  /**
   * compute the selected state for a given row, based on the current gesture
   * values inside the range pick up the desired value, and values
   * outside the range revert to the initially selected state
   */
  public getIsSelected(index: number): boolean {
    // if we're in the diff range, use the stored value
    if (index >= this.lowerIndex && index <= this.upperIndex) {
      return this.desiredSelection
    }

    return this.snapshot.isSelected(index)
  }
}
