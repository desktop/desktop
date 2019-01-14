import * as readline from 'readline'
import * as fs from 'fs'

export type SassVariable = {
  readonly fileName: string
  readonly lineNumber: number
  readonly text: string
}

export function listUnencodedSassVariables(
  path: string
): Promise<ReadonlyArray<SassVariable>> {
  return new Promise<ReadonlyArray<SassVariable>>((resolve, reject) => {
    const unencodedVariables = new Array<SassVariable>()

    const lineReader = readline.createInterface({
      input: fs.createReadStream(path),
    })

    let lineNumber = 0

    lineReader.on('line', (line: string) => {
      lineNumber++

      let index = line.indexOf('$', 0)

      if (index > -1) {
        unencodedVariables.push({
          fileName: path,
          lineNumber,
          text: line,
        })
      }
    })

    lineReader.on('close', () => {
      resolve(unencodedVariables)
    })

    lineReader.on('error', (err: Error) => {
      reject(err)
    })
  })
}
