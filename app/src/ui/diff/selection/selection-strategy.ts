import { DiffSelection } from '../../../models/diff'

export interface ISelectionStrategy {
  /**
   * update the selection strategy with the row the user's cursor is over
   */
  update: (index: number) => void

  /**
   * get the diff selection now that the gesture is complete
   */
  done: () => DiffSelection

  isIncluded: (index: number) => boolean
}
