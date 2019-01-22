import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'

/** apply a drag-and-drop change to the current diff */
export class DragDropSelection implements ISelectionStrategy {
  private readonly start: number
  private readonly desiredSelection: boolean
  private readonly snapshot: DiffSelection

  // the current row the cursor is hovering over
  private current: number

  public constructor(
    start: number,
    desiredSelection: boolean,
    snapshot: DiffSelection
  ) {
    this.start = start
    this.desiredSelection = desiredSelection
    this.snapshot = snapshot

    this.current = start
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

  public isIncluded(index: number) {
    return index >= this.lowerIndex && index <= this.upperIndex
      ? this.desiredSelection
      : this.snapshot.isSelected(index)
  }
}
