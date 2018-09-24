import * as Deque from 'double-ended-queue'

import { FileEntry, GitStatusEntry } from '../models/status'

type StatusItem = IStatusHeader | IStatusEntry

export interface IStatusHeader {
  readonly kind: 'header'
  readonly value: string
}

/** A representation of a parsed status entry from git status */
export interface IStatusEntry {
  readonly kind: 'entry'

  /** The path to the file relative to the repository root */
  readonly path: string

  /** The two character long status code */
  readonly statusCode: string

  /** The original path in the case of a renamed file */
  readonly oldPath?: string
}

export function isStatusHeader(
  statusItem: StatusItem
): statusItem is IStatusHeader {
  return statusItem.kind === 'header'
}

export function isStatusEntry(
  statusItem: StatusItem
): statusItem is IStatusEntry {
  return statusItem.kind === 'entry'
}

const ChangedEntryType = '1'
const RenamedOrCopiedEntryType = '2'
const UnmergedEntryType = 'u'
const UntrackedEntryType = '?'
const IgnoredEntryType = '!'

/** Parses output from git status --porcelain -z into file status entries */
export function parsePorcelainStatus(
  output: string
): ReadonlyArray<StatusItem> {
  const entries = new Array<StatusItem>()

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

  const tokens = output.split('\0')
  const queue = new Deque(tokens)

  let field: string | undefined

  while ((field = queue.shift())) {
    if (field.startsWith('# ') && field.length > 2) {
      entries.push({ kind: 'header', value: field.substr(2) })
      continue
    }

    const entryKind = field.substr(0, 1)

    if (entryKind === ChangedEntryType) {
      entries.push(parseChangedEntry(field))
    } else if (entryKind === RenamedOrCopiedEntryType) {
      entries.push(parsedRenamedOrCopiedEntry(field, queue.shift()))
    } else if (entryKind === UnmergedEntryType) {
      entries.push(parseUnmergedEntry(field))
    } else if (entryKind === UntrackedEntryType) {
      entries.push(parseUntrackedEntry(field))
    } else if (entryKind === IgnoredEntryType) {
      // Ignored, we don't care about these for now
    }
  }

  return entries
}

// 1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>
const changedEntryRe = /^1 ([MADRCUTX?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([\s\S]*?)$/

function parseChangedEntry(field: string): IStatusEntry {
  const match = changedEntryRe.exec(field)

  if (!match) {
    throw new Error(`Failed to parse status line for changed entry: ${field}`)
  }

  return {
    kind: 'entry',
    statusCode: match[1],
    path: match[8],
  }
}

// 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
const renamedOrCopiedEntryRe = /^2 ([MADRCUTX?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([RC]\d+) ([\s\S]*?)$/

function parsedRenamedOrCopiedEntry(
  field: string,
  oldPath: string | undefined
): IStatusEntry {
  const match = renamedOrCopiedEntryRe.exec(field)

  if (!match) {
    throw new Error(
      `Failed to parse status line for renamed or copied entry: ${field}`
    )
  }

  if (!oldPath) {
    throw new Error(
      'Failed to parse renamed or copied entry, could not parse old path'
    )
  }

  return {
    kind: 'entry',
    statusCode: match[1],
    oldPath,
    path: match[9],
  }
}

// u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
const unmergedEntryRe = /^u ([DAU]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([a-f0-9]+) ([\s\S]*?)$/

function parseUnmergedEntry(field: string): IStatusEntry {
  const match = unmergedEntryRe.exec(field)

  if (!match) {
    throw new Error(`Failed to parse status line for unmerged entry: ${field}`)
  }

  return {
    kind: 'entry',
    statusCode: match[1],
    path: match[10],
  }
}

function parseUntrackedEntry(field: string): IStatusEntry {
  const path = field.substr(2)
  return {
    kind: 'entry',
    // NOTE: We return ?? instead of ? here to play nice with mapStatus,
    // might want to consider changing this (and mapStatus) in the future.
    statusCode: '??',
    path,
  }
}

/**
 * Map the raw status text from Git to a structure we can work with in the app.
 */
export function mapStatus(status: string): FileEntry {
  if (status === '??') {
    return {
      kind: 'untracked',
    }
  }

  if (status === '.M') {
    return {
      kind: 'ordinary',
      type: 'modified',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Modified,
    }
  }

  if (status === 'M.') {
    return {
      kind: 'ordinary',
      type: 'modified',
      index: GitStatusEntry.Modified,
      workingTree: GitStatusEntry.Unchanged,
    }
  }

  if (status === '.A') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Added,
    }
  }

  if (status === 'A.') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Added,
      workingTree: GitStatusEntry.Unchanged,
    }
  }

  if (status === '.D') {
    return {
      kind: 'ordinary',
      type: 'deleted',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Deleted,
    }
  }

  if (status === 'D.') {
    return {
      kind: 'ordinary',
      type: 'deleted',
      index: GitStatusEntry.Deleted,
      workingTree: GitStatusEntry.Unchanged,
    }
  }

  if (status === 'R.') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Renamed,
      workingTree: GitStatusEntry.Unchanged,
    }
  }

  if (status === '.R') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Renamed,
    }
  }

  if (status === 'C.') {
    return {
      kind: 'copied',
      index: GitStatusEntry.Copied,
      workingTree: GitStatusEntry.Unchanged,
    }
  }

  if (status === '.C') {
    return {
      kind: 'copied',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Copied,
    }
  }

  if (status === 'AD') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Added,
      workingTree: GitStatusEntry.Deleted,
    }
  }

  if (status === 'AM') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Added,
      workingTree: GitStatusEntry.Modified,
    }
  }

  if (status === 'RM') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Renamed,
      workingTree: GitStatusEntry.Modified,
    }
  }

  if (status === 'RD') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Renamed,
      workingTree: GitStatusEntry.Deleted,
    }
  }

  if (status === 'DD') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.Deleted,
    }
  }

  if (status === 'AU') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Added,
      them: GitStatusEntry.Modified,
    }
  }

  if (status === 'UD') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Modified,
      them: GitStatusEntry.Deleted,
    }
  }

  if (status === 'UA') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Modified,
      them: GitStatusEntry.Added,
    }
  }

  if (status === 'DU') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.Modified,
    }
  }

  if (status === 'AA') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Added,
      them: GitStatusEntry.Added,
    }
  }

  if (status === 'UU') {
    return {
      kind: 'conflicted',
      us: GitStatusEntry.Modified,
      them: GitStatusEntry.Modified,
    }
  }

  // as a fallback, we assume the file is modified in some way
  return {
    kind: 'ordinary',
    type: 'modified',
  }
}
