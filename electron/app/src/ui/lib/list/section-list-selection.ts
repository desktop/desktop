import * as React from 'react'
import {
  getTotalRowCount,
  globalIndexToRowIndexPath,
  InvalidRowIndexPath,
  isValidRow,
  RowIndexPath,
  rowIndexPathEquals,
  rowIndexPathToGlobalIndex,
} from './list-row-index-path'

export type SelectionDirection = 'up' | 'down'

interface ISelectRowAction {
  /**
   * The vertical direction use when searching for a selectable row.
   */
  readonly direction: SelectionDirection

  /**
   * The starting row index to search from.
   */
  readonly row: RowIndexPath

  /**
   * A flag to indicate or not to look beyond the last or first
   * row (depending on direction) such that given the last row and
   * a downward direction will consider the first row as a
   * candidate or given the first row and an upward direction
   * will consider the last row as a candidate.
   *
   * Defaults to true if not set.
   */
  readonly wrap?: boolean
}

/**
 * Interface describing a user initiated selection change event
 * originating from a pointer device clicking or pressing on an item.
 */
export interface IMouseClickSource {
  readonly kind: 'mouseclick'
  readonly event: React.MouseEvent<any>
}

/**
 * Interface describing a user initiated selection change event
 * originating from a pointer device hovering over an item.
 * Only applicable when selectedOnHover is set.
 */
export interface IHoverSource {
  readonly kind: 'hover'
  readonly event: React.MouseEvent<any>
}

/**
 * Interface describing a user initiated selection change event
 * originating from a keyboard
 */
export interface IKeyboardSource {
  readonly kind: 'keyboard'
  readonly event: React.KeyboardEvent<any>
}

/**
 * Interface describing a user initiated selection of all list
 * items (usually by clicking the Edit > Select all menu item in
 * the application window). This is highly specific to GitHub Desktop
 */
export interface ISelectAllSource {
  readonly kind: 'select-all'
}

/**
 * Interface describing a user initiated selection change event originating
 * when focusing the list when it has no selection.
 */
export interface IFocusSource {
  readonly kind: 'focus'
}

/** A type union of possible sources of a selection changed event */
export type SelectionSource =
  | IMouseClickSource
  | IHoverSource
  | IKeyboardSource
  | ISelectAllSource
  | IFocusSource

/**
 * Determine the next selectable row, given the direction and a starting
 * row index. Whether a row is selectable or not is determined using
 * the `canSelectRow` function, which defaults to true if not provided.
 *
 * Returns null if no row can be selected or if the only selectable row is
 * identical to the given row parameter.
 */
export function findNextSelectableRow(
  rowCount: ReadonlyArray<number>,
  action: ISelectRowAction,
  canSelectRow: (indexPath: RowIndexPath) => boolean = row => true
): RowIndexPath | null {
  const totalRowCount = getTotalRowCount(rowCount)
  if (totalRowCount === 0) {
    return null
  }

  const { direction, row } = action
  const wrap = action.wrap === undefined ? true : action.wrap
  const rowIndex = rowIndexPathEquals(InvalidRowIndexPath, row)
    ? -1
    : rowIndexPathToGlobalIndex(row, rowCount)

  if (rowIndex === null) {
    return null
  }

  // Ensure the row value is in the range between 0 and rowCount - 1
  //
  // If the row falls outside this range, use the direction
  // given to choose a suitable value:
  //
  //  - move in an upward direction -> select last row
  //  - move in a downward direction -> select first row
  //
  let currentRow = isValidRow(row, rowCount)
    ? rowIndex
    : direction === 'up'
    ? totalRowCount - 1
    : 0

  // handle specific case from switching from filter text to list
  //
  // locking currentRow to [0,rowCount) above means that the below loops
  // will skip over the first entry
  if (direction === 'down' && rowIndexPathEquals(row, InvalidRowIndexPath)) {
    currentRow = -1
  }

  const delta = direction === 'up' ? -1 : 1

  // Iterate through all rows (starting offset from the
  // given row and ending on and including the given row)
  for (let i = 0; i < totalRowCount; i++) {
    currentRow += delta

    if (currentRow >= totalRowCount) {
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
        currentRow = totalRowCount - 1
      } else {
        break
      }
    }

    const currentRowIndexPath = globalIndexToRowIndexPath(currentRow, rowCount)
    if (
      currentRowIndexPath !== null &&
      !rowIndexPathEquals(row, currentRowIndexPath) &&
      canSelectRow(currentRowIndexPath)
    ) {
      return currentRowIndexPath
    }
  }

  return null
}

/**
 * Find the last selectable row in either direction, used
 * for moving to the first or last selectable row in a list,
 * i.e. Home/End key navigation.
 */
export function findLastSelectableRow(
  direction: SelectionDirection,
  rowCount: ReadonlyArray<number>,
  canSelectRow: (indexPath: RowIndexPath) => boolean
): RowIndexPath | null {
  const totalRowCount = getTotalRowCount(rowCount)
  let i = direction === 'up' ? 0 : totalRowCount - 1
  const delta = direction === 'up' ? 1 : -1

  for (; i >= 0 && i < totalRowCount; i += delta) {
    const indexPath = globalIndexToRowIndexPath(i, rowCount)
    if (indexPath !== null && canSelectRow(indexPath)) {
      return indexPath
    }
  }

  return null
}
