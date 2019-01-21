import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'
import { DiffLineGutter } from '../diff-line-gutter'
import { range } from '../../../lib/range'

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

  public paint(elements: Map<number, DiffLineGutter>) {
    range(this._start, this._end + 1).forEach(row => {
      const element = elements.get(row)

      if (!element) {
        // if the element has not been rendered, it's not visible to the user
        return
      }

      if (!element.isIncluded()) {
        return
      }

      element.setSelected(this._desiredSelection)
    })
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
}
