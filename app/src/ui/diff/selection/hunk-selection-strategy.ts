import { DiffSelection } from '../../../models/diff'
import { ISelectionStrategy } from './selection-strategy'
import { range } from '../../../lib/range'
import { selectedLineClass } from './selection'

/** apply hunk selection to the current diff */
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
    range(this._start, this._end).forEach(row => {
      const element = elements.get(row)

      if (!element) {
        // if the element has not been rendered, it's not visible to the user
        return
      }

      // HACK: Don't update classes for non-selectable lines
      const classList = element.children[0].classList
      if (!classList.contains('diff-add') && !classList.contains('diff-delete')) {
        return
      }

      const selected = this._desiredSelection
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

  public apply(onIncludeChanged: (diffSelection: DiffSelection) => void) {

    const length = (this._end - this._start) + 1

    const newSelection = this._snapshot.withRangeSelection(
      this._start,
      length,
      this._desiredSelection)

    onIncludeChanged(newSelection)
  }
}
