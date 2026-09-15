import {
  FileEntry,
  GitStatusEntry,
  SubmoduleStatus,
  UnmergedEntrySummary,
} from '../models/status'
import { splitBuffer } from './split-buffer'

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

  /** The four character long submodule status code */
  readonly submoduleStatusCode: string

  /** The original path in the case of a renamed file */
  readonly oldPath?: string

  /** The rename or copy score in the case of a renamed file */
  readonly renameOrCopyScore?: number
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
  output: Buffer
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

  const tokens = splitBuffer(output, '\0')

  for (let i = 0; i < tokens.length; i++) {
    const field = tokens[i].toString()
    if (field.startsWith('# ') && field.length > 2) {
      entries.push({ kind: 'header', value: field.substring(2) })
      continue
    }

    const entryKind = field.substring(0, 1)

    if (entryKind === ChangedEntryType) {
      entries.push(parseChangedEntry(field))
    } else if (entryKind === RenamedOrCopiedEntryType) {
      entries.push(parsedRenamedOrCopiedEntry(field, tokens[++i].toString()))
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
const changedEntryRe =
  /^1 ([MADRCUTX?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([\s\S]*?)$/

function parseChangedEntry(field: string): IStatusEntry {
  const match = changedEntryRe.exec(field)

  if (!match) {
    log.debug(`parseChangedEntry parse error: ${field}`)
    throw new Error(`Failed to parse status line for changed entry`)
  }

  return {
    kind: 'entry',
    statusCode: match[1],
    submoduleStatusCode: match[2],
    path: match[8],
  }
}

// 2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <X><score> <path><sep><origPath>
const renamedOrCopiedEntryRe =
  /^2 ([MADRCUTX?!.]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([RC]\d+) ([\s\S]*?)$/

function parsedRenamedOrCopiedEntry(
  field: string,
  oldPath: string | undefined
): IStatusEntry {
  const match = renamedOrCopiedEntryRe.exec(field)

  if (!match) {
    log.debug(`parsedRenamedOrCopiedEntry parse error: ${field}`)
    throw new Error(`Failed to parse status line for renamed or copied entry`)
  }

  if (!oldPath) {
    throw new Error(
      'Failed to parse renamed or copied entry, could not parse old path'
    )
  }

  return {
    kind: 'entry',
    statusCode: match[1],
    submoduleStatusCode: match[2],
    oldPath,
    renameOrCopyScore: parseInt(match[8].substring(1), 10),
    path: match[9],
  }
}

// u <xy> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>
const unmergedEntryRe =
  /^u ([DAU]{2}) (N\.\.\.|S[C.][M.][U.]) (\d+) (\d+) (\d+) (\d+) ([a-f0-9]+) ([a-f0-9]+) ([a-f0-9]+) ([\s\S]*?)$/

function parseUnmergedEntry(field: string): IStatusEntry {
  const match = unmergedEntryRe.exec(field)

  if (!match) {
    log.debug(`parseUnmergedEntry parse error: ${field}`)
    throw new Error(`Failed to parse status line for unmerged entry`)
  }

  return {
    kind: 'entry',
    statusCode: match[1],
    submoduleStatusCode: match[2],
    path: match[10],
  }
}

function parseUntrackedEntry(field: string): IStatusEntry {
  const path = field.substring(2)
  return {
    kind: 'entry',
    // NOTE: We return ?? instead of ? here to play nice with mapStatus,
    // might want to consider changing this (and mapStatus) in the future.
    statusCode: '??',
    submoduleStatusCode: '????',
    path,
  }
}

function mapSubmoduleStatus(
  submoduleStatusCode: string
): SubmoduleStatus | undefined {
  if (!submoduleStatusCode.startsWith('S')) {
    return undefined
  }

  return {
    commitChanged: submoduleStatusCode[1] === 'C',
    modifiedChanges: submoduleStatusCode[2] === 'M',
    untrackedChanges: submoduleStatusCode[3] === 'U',
  }
}

/**
 * Map the raw status text from Git to a structure we can work with in the app.
 */
export function mapStatus(
  statusCode: string,
  submoduleStatusCode: string,
  renameOrCopyScore: number | undefined
): FileEntry {
  const submoduleStatus = mapSubmoduleStatus(submoduleStatusCode)

  if (statusCode === '??') {
    return { kind: 'untracked', submoduleStatus }
  }

  if (statusCode === '.M') {
    return {
      kind: 'ordinary',
      type: 'modified',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Modified,
      submoduleStatus,
    }
  }

  if (statusCode === 'M.') {
    return {
      kind: 'ordinary',
      type: 'modified',
      index: GitStatusEntry.Modified,
      workingTree: GitStatusEntry.Unchanged,
      submoduleStatus,
    }
  }

  if (statusCode === '.A') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Added,
      submoduleStatus,
    }
  }

  if (statusCode === 'A.') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Added,
      workingTree: GitStatusEntry.Unchanged,
      submoduleStatus,
    }
  }

  if (statusCode === '.D') {
    return {
      kind: 'ordinary',
      type: 'deleted',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Deleted,
      submoduleStatus,
    }
  }

  if (statusCode === 'D.') {
    return {
      kind: 'ordinary',
      type: 'deleted',
      index: GitStatusEntry.Deleted,
      workingTree: GitStatusEntry.Unchanged,
      submoduleStatus,
    }
  }

  if (statusCode === 'R.') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Renamed,
      workingTree: GitStatusEntry.Unchanged,
      renameOrCopyScore,
      submoduleStatus,
    }
  }

  if (statusCode === '.R') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Renamed,
      renameOrCopyScore,
      submoduleStatus,
    }
  }

  if (statusCode === 'C.') {
    return {
      kind: 'copied',
      index: GitStatusEntry.Copied,
      workingTree: GitStatusEntry.Unchanged,
      submoduleStatus,
    }
  }

  if (statusCode === '.C') {
    return {
      kind: 'copied',
      index: GitStatusEntry.Unchanged,
      workingTree: GitStatusEntry.Copied,
      submoduleStatus,
    }
  }

  if (statusCode === 'AD') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Added,
      workingTree: GitStatusEntry.Deleted,
      submoduleStatus,
    }
  }

  if (statusCode === 'AM') {
    return {
      kind: 'ordinary',
      type: 'added',
      index: GitStatusEntry.Added,
      workingTree: GitStatusEntry.Modified,
      submoduleStatus,
    }
  }

  if (statusCode === 'RM') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Renamed,
      workingTree: GitStatusEntry.Modified,
      renameOrCopyScore,
      submoduleStatus,
    }
  }

  if (statusCode === 'RD') {
    return {
      kind: 'renamed',
      index: GitStatusEntry.Renamed,
      workingTree: GitStatusEntry.Deleted,
      renameOrCopyScore,
      submoduleStatus,
    }
  }

  if (statusCode === 'DD') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothDeleted,
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.Deleted,
      submoduleStatus,
    }
  }

  if (statusCode === 'AU') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.AddedByUs,
      us: GitStatusEntry.Added,
      them: GitStatusEntry.UpdatedButUnmerged,
      submoduleStatus,
    }
  }

  if (statusCode === 'UD') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.DeletedByThem,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.Deleted,
      submoduleStatus,
    }
  }

  if (statusCode === 'UA') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.AddedByThem,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.Added,
      submoduleStatus,
    }
  }

  if (statusCode === 'DU') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.DeletedByUs,
      us: GitStatusEntry.Deleted,
      them: GitStatusEntry.UpdatedButUnmerged,
      submoduleStatus,
    }
  }

  if (statusCode === 'AA') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothAdded,
      us: GitStatusEntry.Added,
      them: GitStatusEntry.Added,
      submoduleStatus,
    }
  }

  if (statusCode === 'UU') {
    return {
      kind: 'conflicted',
      action: UnmergedEntrySummary.BothModified,
      us: GitStatusEntry.UpdatedButUnmerged,
      them: GitStatusEntry.UpdatedButUnmerged,
      submoduleStatus,
    }
  }

  // as a fallback, we assume the file is modified in some way
  return {
    kind: 'ordinary',
    type: 'modified',
    submoduleStatus,
  }
}
