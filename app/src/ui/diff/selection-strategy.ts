import { DiffSelection } from '../../models/diff'

export interface ISelectionStrategy {
  /**
   * update the current selection strategy with the active row
   */
  update: (index: number) => void,
  /**
   * repaint the current diff gutter to visualize the current state
   */
  paint: (elements: Map<number, HTMLSpanElement>) => void
  /**
   * apply the diff selection result to the current diff
   */
  apply: (onIncludeChanged?: (diffSelection: DiffSelection) => void) => void
}
