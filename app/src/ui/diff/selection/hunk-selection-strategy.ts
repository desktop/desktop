import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'

export class HunkSelection implements ISelectionStrategy {
  private readonly _start: number
  private readonly _end: number
  private readonly _desiredSelection: boolean
  private readonly _snapshot: DiffSelection

  public constructor(start: number, end: number, desiredSelection: boolean, snapshot: DiffSelection) {
    this._start = start
    this._end = end
    this._desiredSelection = desiredSelection
    this._snapshot = snapshot
  }

  public update(index: number) {
    // no-op
  }

  public paint(elements: Map<number, HTMLSpanElement>) {
    // TODO: anything here?
  }

  public apply(onIncludeChanged: (diffSelection: DiffSelection) => void) {

    const length = (this._end - this._start) + 1

    const newSelection = this._snapshot.withRangeSelection(
      this._start,
      length,
      this._desiredSelection)

    onIncludeChanged(newSelection)
  }
}
