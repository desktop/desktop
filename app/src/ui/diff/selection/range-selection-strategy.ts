import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'

/** apply hunk selection to the current diff */
export class RangeSelection implements ISelectionStrategy {
  private readonly _start: number
  private readonly _end: number
  private readonly _desiredSelection: boolean
  private readonly _snapshot: DiffSelection

  public get start() {
    return this._start
  }
  public get end() {
    return this._end
  }

  public constructor(
    start: number,
    end: number,
    desiredSelection: boolean,
    snapshot: DiffSelection
  ) {
    this._start = start
    this._end = end
    this._desiredSelection = desiredSelection
    this._snapshot = snapshot
  }

  public update(index: number) {
    // no-op
  }

  public done(): DiffSelection {
    const length = this._end - this._start + 1

    const newSelection = this._snapshot.withRangeSelection(
      this._start,
      length,
      this._desiredSelection
    )

    return newSelection
  }

  public isIncluded(index: number) {
    return index >= this.start && index <= this.end
      ? this._desiredSelection
      : this._snapshot.isSelected(index)
  }
}
