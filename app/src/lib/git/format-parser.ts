/**
 * Base class for the two Git --format output parsers.
 */
class NullDelimiterParser<T extends { [name: string]: string }> {
  private readonly keys = new Array<string>()
  public readonly format: string = ''

  /**
   * @param fields An object keyed on the friendly name of
   *               the value being parsed with the value being
   *               the format string of said value.
   *
   * @param delimiterString Either '%x00' or '%00' depending
   *                        on the Git internal --format processor.
   */
  public constructor(fields: T, delimiterString: '%x00' | '%00') {
    for (const [key, value] of Object.entries(fields)) {
      this.keys.push(key)
      this.format = `${this.format}${value}${delimiterString}`
    }
  }

  /**
   * Parses `git ... --format` output according to the provided
   * fields and delimiter string provided in the constructor.
   */
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

/**
 * A parser which splits fields from one another in the output
 * of Git commands which support `--format=`.
 *
 * Unfortunately Git --format exists in essentially two versions.
 * One derived from `git log` and one that's derived from an internal
 * Git system called `ref-filter`.
 *
 * The parser will work for commands that are derived from
 * `git log` such as `git log` itself, `git stash` and other
 * commands which operate primarily on commits.
 */
export class GitLogFormatParser<
  T extends { [name: string]: string }
> extends NullDelimiterParser<T> {
  /**
   * Create a new `GitLogFormatParser` suitable for parsing --format
   * output from commands such as `git log`, `git stash`, and
   * other commands that are not derived from `ref-filter`.
   *
   * @param fields An object keyed on the friendly name of
   *               the value being parsed with the value being
   *               the format string of said value.
   *
   *               Example:
   *
   *               `new GitFormatParser({ sha: '%H' })`
   *
   */
  public constructor(fields: T) {
    super(fields, '%x00')
  }
}

/**
 * A parser which splits fields from one another in the output
 * of Git commands which support `--format=`.
 *
 * Unfortunately Git --format exists in essentially two versions.
 * One derived from `git log` and one derived from an internal Git
 * system called `ref-filter`.
 *
 * The parser will work for commands that are derived from
 * `ref-filter` such as `git for-each-ref`, `git branch` and
 * other commands which operate primarily on references.
 */
export class GitFormatParser<
  T extends { [name: string]: string }
> extends NullDelimiterParser<T> {
  /**
   * Create a new `GitFormatParser` suitable for parsing --format
   * output from commands such as `git for-each-ref`, `git branch`,
   * and other commands that are not derived from `git log`.
   *
   * @param fields An object keyed on the friendly name of
   *               the value being parsed with the value being
   *               the format string of said value.
   *
   *               Example:
   *
   *               `new GitFormatParser({ sha: '%(objectname)' })`
   *
   */
  public constructor(fields: T) {
    super(fields, '%00')
  }
}
