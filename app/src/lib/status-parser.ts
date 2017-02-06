/** A representation of a parsed status entry from git status */
export interface IStatusEntry {
  /** The path to the file relative to the repository root */
  readonly path: string,

  /** The two character long status code */
  readonly statusCode: string

  /** The original path in the case of a renamed file */
  readonly oldPath?: string
}

/** Parses output from git status --porcelain -z into file status entries */
export function parsePorcelainStatus(output: string): ReadonlyArray<IStatusEntry> {
  const entries = new Array<IStatusEntry>()

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
    // The status field is two letters followed by a space
    // and then comes the path.
    const statusCode = field.substr(0, 2)
    const path = field.substr(3)

    let oldPath: string | undefined = undefined

    // In the case of renames there's one more field separated
    // by a null character which holds the source/original path
    // before the rename.
    if (statusCode.startsWith('R') || statusCode.startsWith('C')) {
      oldPath = fields.shift()
    }

    entries.push({ path, statusCode, oldPath })
  }

  return entries
}
