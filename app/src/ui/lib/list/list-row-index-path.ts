export type RowIndexPath = {
  readonly row: number
  readonly section: number
}

export const InvalidRowIndexPath: RowIndexPath = { section: -1, row: -1 }

export function rowIndexPathEquals(a: RowIndexPath, b: RowIndexPath): boolean {
  return a.section === b.section && a.row === b.row
}

export function getTotalRowCount(rowCount: ReadonlyArray<number>) {
  return rowCount.reduce((sum, count) => sum + count, 0)
}

export function rowIndexPathToGlobalIndex(
  indexPath: RowIndexPath,
  rowCount: ReadonlyArray<number>
): number | null {
  if (!isValidRow(indexPath, rowCount)) {
    return null
  }

  let index = 0

  for (let section = 0; section < indexPath.section; section++) {
    index += rowCount[section]
  }

  index += indexPath.row

  return index
}

export function globalIndexToRowIndexPath(
  index: number,
  rowCount: ReadonlyArray<number>
): RowIndexPath | null {
  if (index < 0 || index >= getTotalRowCount(rowCount)) {
    return null
  }

  let section = 0
  let row = index

  while (row >= rowCount[section]) {
    row -= rowCount[section]
    section++
  }

  return { section, row }
}

export function isValidRow(
  indexPath: RowIndexPath,
  rowCount: ReadonlyArray<number>
) {
  return (
    indexPath.section >= 0 &&
    indexPath.section < rowCount.length &&
    indexPath.row >= 0 &&
    indexPath.row < rowCount[indexPath.section]
  )
}

export function getFirstRowIndexPath(
  rowCount: ReadonlyArray<number>
): RowIndexPath | null {
  if (rowCount.length > 0) {
    for (let section = 0; section < rowCount.length; section++) {
      if (rowCount[section] > 0) {
        return { section, row: 0 }
      }
    }
  }

  return null
}

export function getLastRowIndexPath(
  rowCount: ReadonlyArray<number>
): RowIndexPath | null {
  if (rowCount.length > 0) {
    for (let section = rowCount.length - 1; section >= 0; section--) {
      if (rowCount[section] > 0) {
        return { section, row: rowCount[section] - 1 }
      }
    }
  }

  return null
}
