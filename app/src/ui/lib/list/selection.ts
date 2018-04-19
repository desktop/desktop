export type SelectionDirection = 'up' | 'down'

interface ISelectionEvent {
  /**
   * The vertical direction use when searching for a selectable row.
   */
  readonly direction: SelectionDirection

  /**
   * The starting row index to search from.
   */
  readonly row: number

  /**
   * Whether or not to look beyond the last or first row
   * (depending on direction) such that given the last row and
   * a downward direction we'll consider the first row as a
   * candidate or given the first row and an upward direction
   * we'll consider the last row as a candidate.
   *
   * Defaults to true if not set.
   */
  readonly wrap?: boolean
}

/**
 * Determine the next selectable row, provided the starting row and a direction to move.
 *
 * Returns null if no row can be selected.
 */
export function findNextSelectableRow(
  rowCount: number,
  event: ISelectionEvent,
  canSelectRow: (row: number) => boolean = row => true
): number | null {
  if (rowCount === 0) {
    return null
  }

  const { direction, row } = event
  const wrap = event.wrap === undefined ? true : event.wrap

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
