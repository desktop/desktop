export type SelectionDirection = 'up' | 'down'

interface ISelectionEvent {
  /**
   * The direction to move from the current row.
   */
  readonly direction: SelectionDirection

  /**
   * The selected row in the list to use as a starting point.
   */
  readonly row: number

  readonly wrap: boolean
}

/**
 * Determine the next selectable row, given the direction and row.
 *
 * Returns null if no row can be selected.
 */
export function findNextSelectableRow(
  rowCount: number,
  canSelectRow: (row: number) => boolean,
  event: ISelectionEvent
): number | null {
  if (rowCount === 0) {
    return null
  }

  const { direction, row, wrap } = event

  // If we've been given a row that's out of bounds
  // we'll coerce it to a valid index starting either
  // at the bottom or the top depending on the direction.
  //
  // Given a row that would be below the last item and
  // an upward direction we'll pick the last selectable row
  // or the first selectable given an upward direction.
  //
  // Given a row that would be before the first item (-1)
  // and a downward direction we'll pick the first selectable
  // row or the first selectable given an upward direction.
  let currentRow =
    row < 0 || row >= rowCount ? (direction === 'up' ? rowCount - 1 : 0) : row

  const delta = direction === 'up' ? -1 : 1

  // Iterate through all rows (starting offset from the
  // given row and ending on and including the given row)
  for (let i = 0; i < rowCount; i++) {
    currentRow += delta

    if (currentRow >= rowCount) {
      // We've hit rock bottom, wrap around to the top
      // if we're allowed to or give up.
      if (wrap) {
        currentRow = 0
      } else {
        break
      }
    } else if (currentRow < 0) {
      // We've reached the top, wrap around to the bottom
      // if we're allowed to or give up
      if (wrap) {
        currentRow = rowCount - 1
      } else {
        break
      }
    }

    if (canSelectRow(currentRow) && row !== currentRow) {
      return currentRow
    }
  }

  return null
}
