import { DiffSelection } from '../../models/diff'

export class GutterSelectionState {
  private readonly _start: number
  private readonly _desiredSelection: boolean
  private readonly _snapshot: DiffSelection

  private _current: number

  public constructor(start: number, desiredSelection: boolean, snapshot: DiffSelection) {
    this._start = start
    this._current = start
    this._desiredSelection = desiredSelection
    this._snapshot = snapshot
  }

  /**
   * Return the lower bounds of the selection range
   */
  public get lowerIndex(): number {
    if (this._start <= this._current) {
      return this._start
    }

    return this._current
  }

  /**
   * Return the upper bounds of the selection range
   */
  public get upperIndex(): number {
    if (this._start <= this._current) {
      return this._current
    }

    return this._start
  }

  /**
   * Return the index associated with the start of this gesture
   */
  public get initialIndex(): number {
      return this._start
  }

  /**
   * Return the index associated with the start of this gesture
   */
  public get desiredSelection(): boolean {
    return this._desiredSelection
  }

  /**
   * update the row the user is currently interacting with
   */
  public updateRangeSelection(current: number) {
    this._current = current
  }

  /**
   * compute the selected state for a given row, based on the current gesture
   * values inside the range pick up the desired value, and values
   * outside the range revert to the initially selected state
   */
  public getIsSelected(index: number): boolean {
    // if we're in the diff range, use the stored value
    if (index >= this.lowerIndex && index <= this.upperIndex) {
      return this._desiredSelection
    }

    return this._snapshot.isSelected(index)
  }
}
