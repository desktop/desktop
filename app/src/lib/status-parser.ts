export interface IStatusHeader {
  readonly kind: 'header'
  readonly value: string
}

/** A representation of a parsed status entry from git status */
export interface IStatusEntry {
  readonly kind: 'entry'

  /** The path to the file relative to the repository root */
  readonly path: string,

  /** The two character long status code */
  readonly statusCode: string

  /** The original path in the case of a renamed file */
  readonly oldPath?: string
}

/** Parses output from git status --porcelain -z into file status entries */
export function parsePorcelainStatus(output: string): ReadonlyArray<IStatusHeader | IStatusEntry> {
  const entries = new Array<IStatusEntry | IStatusHeader>()

  // See https://git-scm.com/docs/git-status
  //
  // In the short-format, the status of each path is shown as
  // XY PATH1 -> PATH2
  //
  // There is also an alternate -z format recommended for machine parsing. In that
  // format, the status field is the same, but some other things change. First,
  // the -> is omitted from rename entries and the field order is reversed (e.g
  // from -> to becomes to from). Second, a NUL (ASCII 0) follows each filename,
  // replacing space as a field separator and the terminating newline (but a space
  // still separates the status field from the first filename). Third, filenames
  // containing special characters are not specially formatted; no quoting or
  // backslash-escaping is performed.

  const fields = output.split('\0')
  let field: string | undefined

  while (field = fields.shift()) {

    if (field.startsWith('# ') && field.length > 2) {
      entries.push({ kind: 'header', value: field.substr(2) })
      continue
    }

    const entryKind = field.substr(0, 1)

    if (entryKind === '1') {
      // Ordinary changed entries
      // 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
      const match = field.match(/^1 ([MADRCU?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) (.*?)$/)
      if (!match) {
        throw new Error(`Failed to parse status line for changed entry: ${field}`)
      }

      entries.push({
        kind: 'entry',
        statusCode: match[2],
        path: match[9],
      })
    } else if (entryKind === '2') {
      // Renamed or copied entries
      // 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
      const match = field.match(/^2 ([MADRCU?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([RC]\d+) (.*?)$/)

      if (!match) {
        throw new Error(`Failed to parse status line for renamed or copied entry: ${field}`)
      }

      const oldPath = fields.shift()

      if (!oldPath) {
        throw new Error('Failed to parse renamed or copied entry, could not parse old path')
      }

      entries.push({
        kind: 'entry',
    } else if (entryKind === 'u') {
      // Unmerged entries
      // u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
      const match = field.match(/^u ([DAU]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([a-f0-9]+) (.*?)$/)

      if (!match) {
        throw new Error(`Failed to parse status line for unmerged entry: ${field}`)
      }

      entries.push({
        kind: 'entry',
        statusCode: match[2],
        path: match[11],
      })
    } else if (entryKind === '?') {
      // Untracked
      const path = field.substr(2)
      entries.push({
        kind: 'entry',
        statusCode: '??',
        path,
      })
    } else if (entryKind === '!') {
      // Ignored, we don't care about these for now
    }
  }

  return entries
}
