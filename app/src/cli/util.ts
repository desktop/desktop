import * as Path from 'path'

import stripAnsi = require('strip-ansi')

export type TypeName =
  | 'string'
  | 'number'
  | 'boolean'
  | 'symbol'
  | 'undefined'
  | 'object'
  | 'function'

// stolen from https://github.com/yargs/yargs/blob/ab592c392042/yargs.js#L35-L50
// under the MIT license
export let $0 = process.argv
  .slice(0, 2)
  .map(function(x, i) {
    // ignore the node bin, specify this in your
    // bin file with #!/usr/bin/env node
    if (i === 0 && /\b(node|iojs)(\.exe)?$/.test(x)) {
      return
    }
    const b = Path.relative(process.cwd(), x)
    return x.match(/^(\/|([a-zA-Z]:)?\\)/) && b.length < x.length ? b : x
  })
  .join(' ')
  .trim()

if (process.env._ !== undefined && process.argv[1] === process.env._) {
  $0 = process.env._.replace(Path.dirname(process.execPath) + '/', '')
}
// end

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
