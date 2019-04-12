import { assertNever } from '../fatal-error'

export enum DelimiterFormat {
  Git,
  GitLog,
}

function getDelimiterString(format: DelimiterFormat) {
  switch (format) {
    case DelimiterFormat.Git:
      return '%00'
    case DelimiterFormat.GitLog:
      return '%x00'
  }

  return assertNever(format, `Unknown delimiter format: ${format}`)
}

export class NullDelimiterParser<T extends { [name: string]: string }> {
  private readonly keys = new Array<string>()
  public readonly format: string = ''

  public constructor(fields: T, delimiterFormat: DelimiterFormat) {
    const delimiterString = getDelimiterString(delimiterFormat)
    for (const [key, value] of Object.entries(fields)) {
      this.keys.push(key)
      this.format = `${this.format}${value}${delimiterString}`
    }
  }

  public parse(output: string): T[] {
    const { keys } = this
    const entries = new Array<T>()

    let head = 0
    let tail = 0
    let fieldIndex = 0
    let entry = {} as T

    while (head < output.length && (tail = output.indexOf('\0', head)) !== -1) {
      entry[keys[fieldIndex % keys.length]] = output.substring(head, tail)

      head = tail + 1
      fieldIndex++

      if (fieldIndex % keys.length === 0) {
        entries.push(entry)
        entry = {} as T

        if (head < output.length) {
          if (output[head] !== '\0' && output[head] !== '\n') {
            const char = output.charCodeAt(head)
            throw new Error(
              `Unexpected character at end of record: '0x${char.toString(16)}'`
            )
          }
          head++
        }
      }
    }
    return entries
  }
}
