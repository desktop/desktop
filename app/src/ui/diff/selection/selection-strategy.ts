import { DiffSelection } from '../../../models/diff'
import { DiffLineGutter } from '../diff-line-gutter'

export interface ISelectionStrategy {
  /**
   * update the selection strategy with the row the user's cursor is over
   */
  update: (index: number) => void
  /**
   * repaint the current diff gutter to visualize the current state
   */
  paint: (elements: Map<number, DiffLineGutter>) => void
  /**
   * get the diff selection now that the gesture is complete
   */
  done: () => DiffSelection

  isIncluded: (index: number) => boolean
}
