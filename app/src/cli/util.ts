import stripAnsi from 'strip-ansi'

export type TypeName =
  | 'string'
  | 'number'
  | 'boolean'
  | 'symbol'
  | 'undefined'
  | 'object'
  | 'function'

export class CommandError extends Error {
  public pretty = true
}

export const dasherizeOption = (option: string) => {
  if (option.length === 1) {
    return '-' + option
  } else {
    return '--' + option
  }
}

export function printTable(table: string[][]) {
  const columnWidths = calculateColumnWidths(table)
  for (const row of table) {
    let rowStr = '  '
    row.forEach((item, i) => {
      rowStr += item
      const neededSpaces = columnWidths[i] - stripAnsi(item).length
      rowStr += ' '.repeat(neededSpaces + 2)
    })
    console.log(rowStr)
  }
}

function calculateColumnWidths(table: string[][]) {
  const columnWidths: number[] = Array(table[0].length).fill(0)
  for (const row of table) {
    row.forEach((item, i) => {
      const width = stripAnsi(item).length
      if (columnWidths[i] < width) {
        columnWidths[i] = width
      }
    })
  }
  return columnWidths
}
