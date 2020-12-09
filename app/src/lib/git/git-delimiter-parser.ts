/** Base class for the two Git --format output parsers */
class NullDelimiterParser<T extends Record<string, string>> {
  private readonly keys = new Array<keyof T>()
  public readonly format: string = ''

  /**
   * An array containing --format argument and any other Git arguments needed
   * when calling git log or for-each-ref derived commands.
   */
  public readonly gitArgs: ReadonlyArray<string>

  /**
   * @param fields          An object keyed on the friendly name of the value
   *                        being parsed with the value being the format string
   *                        of said value.
   *
   * @param delimiterString Either '%x00' or '%00' depending on the Git internal
   *                        --format processor.
   *
   * @param delimiterString Any extra arguments besides --format that's needed
   *                        when invoking the Git command.
   */
  public constructor(
    fields: T,
    delimiterString: '%x00' | '%00',
    ...gitArgs: string[]
  ) {
    for (const [key, value] of Object.entries(fields)) {
      this.keys.push(key)
      this.format = `${this.format}${value}${delimiterString}`
    }
    this.gitArgs = [...gitArgs, `--format=${this.format}`]
  }

  /**
   * Parses `git ... --format` output according to the provided fields and
   * delimiter string provided in the constructor.
   */
  public parse(output: string): ReadonlyArray<{ [K in keyof T]: string }> {
    const { keys } = this
    const entries = new Array<{ [K in keyof T]: string }>()

    let head = 0
    let tail = 0
    let fieldIndex = 0
    let entry = {} as { [K in keyof T]: string }

    while (head < output.length && (tail = output.indexOf('\0', head)) !== -1) {
      const key = keys[fieldIndex % keys.length]
      entry[key] = output.substring(head, tail)

      head = tail + 1
      fieldIndex++

      // Have we filled up an entire entry yet?
      if (fieldIndex % keys.length !== 0) {
        continue
      }

      // Look for the record terminator, NULL or NL.
      if (head < output.length) {
        // We can support both NULL and NL here because we always terminate
        // our records with NULL.
        if (output[head] !== '\0' && output[head] !== '\n') {
          const char = `0x${output.charCodeAt(head).toString(16)}`
          throw new Error(`Unexpected character at end of record: '${char}'`)
        }
        head++
      }

      entries.push(entry)
      entry = {} as { [P in keyof T]: string }
    }

    if (fieldIndex % keys.length !== 0) {
      throw new Error('Unexpected end of output')
    }

    return entries
  }
}

/**
 * A parser which splits fields from one another in the output of Git commands
 * which support `--format=`.
 *
 * Unfortunately Git --format exists in essentially two versions. One derived
 * from `git log` and one that's derived from an internal Git system called
 * `ref-filter`.
 *
 * The parser will work for commands that are derived from `git log` such as
 * `git log` itself, `git stash` and other commands which operate primarily on
 * commits.
 */
export class GitLogParser<
  T extends Record<string, string>
> extends NullDelimiterParser<T> {
  /**
   * Create a new `GitLogParser` suitable for parsing --format output from
   * commands such as `git log`, `git stash`, and other commands that are not
   * derived from `ref-filter`.
   *
   * @param fields An object keyed on the friendly name of the value being
   *               parsed with the value being the format string of said value.
   *
   *               Example:
   *
   *               `new GitLogParser({ sha: '%H' })`
   *
   */
  public constructor(fields: T) {
    super(fields, '%x00', '-z')
  }
}

/**
 * A parser which splits fields from one another in the output of Git commands
 * which support `--format=`.
 *
 * Unfortunately Git --format exists in essentially two versions. One derived
 * from `git log` and one derived from an internal Git system called
 * `ref-filter`.
 *
 * The parser will work for commands that are derived from `ref-filter` such as
 * `git for-each-ref`, `git branch` and other commands which operate primarily
 * on references.
 */
export class GitForEachRefParser<
  T extends Record<string, string>
> extends NullDelimiterParser<T> {
  /**
   * Create a new `GitForEachRefParser` suitable for parsing --format output
   * from commands such as `git for-each-ref`, `git branch`, and other commands
   * that are not derived from `git log`.
   *
   * @param fields An object keyed on the friendly name of the value being
   *               parsed with the value being the format string of said value.
   *
   *               Example:
   *
   *               `new GitForEachRefParser({ sha: '%(objectname)' })`
   *
   */
  public constructor(fields: T) {
    super(fields, '%00')
  }
}
