export interface IStatusEntry {
  readonly path: string,
  readonly statusCode: string
  readonly oldPath?: string
}

/** Parses output from git status --porcelain -z */
export function parsePorcelainStatus(output: string): ReadonlyArray<IStatusEntry> {
  const entries = new Array<IStatusEntry>()
  const fields = output.split('\0')
  let field: string | undefined

  while ((field = fields.shift())) {
    const statusCode = field.substr(0, 2)
    const path = field.substr(3)

    let oldPath: string | undefined = undefined

    if (statusCode.startsWith('R')) {
      oldPath = fields.shift()
    }

    entries.push({ path, statusCode, oldPath })
  }

  return entries
}
