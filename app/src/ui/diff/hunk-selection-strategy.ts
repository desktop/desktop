import { DiffSelection } from '../../models/diff'
import { ISelectionStrategy } from './selection-strategy'

export class HunkSelectionStrategy implements ISelectionStrategy {
  public update(index: number) {
    // no-op
  }

  public paint(elements: Map<number, HTMLSpanElement>) {

  }

  public apply(onIncludeChanged: (diffSelection: DiffSelection) => void) {

  }
}
