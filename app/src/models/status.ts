import { DiffSelection } from './diff'
import { OcticonSymbol } from '../ui/octicons'
import { assertNever } from '../lib/fatal-error'

// NOTE: 'U' is considered "Updated but unmerged", and is a valid code here,
// but instead we mark this as "Modified" when surfacing conflicts.
export enum GitFileStatus {
  // M
  Modified,
  // A
  Added,
  // D
  Deleted,
  // R
  Renamed,
  // C
  Copied,
  // .
  Unchanged,
  // ?
  Untracked,
  // !
  Ignored
}

/** the state of the changed file in the working directory */
export enum AppFileStatus {
  New,
  Modified,
  Deleted,
  Copied,
  Renamed,
  Conflicted
}

type OrdinaryChange = {
   /** how we should represent the file in the application */
  readonly kind: 'added' | 'modified' | 'deleted',
  /** the staged status of the file (if known) */
  readonly staged?: GitFileStatus,
  /** the unstaged status of the file (if known) */
  readonly unstaged?: GitFileStatus,
}

type RenamedOrCopiedChange = {
  readonly kind: 'renamed' | 'copied',
  /** the staged status of the file (if known) */
  readonly staged?: GitFileStatus,
  /** the unstaged status of the file (if known) */
  readonly unstaged?: GitFileStatus,
}

type UnmergedChange = {
  readonly kind: 'conflicted',
  /** the first character of the short code ("ours")  */
  readonly us: GitFileStatus,
  /** the second character of the short code ("theirs")  */
  readonly them: GitFileStatus,
}

type UntrackedChange = {
  readonly kind: 'untracked',
}

export type FileStatus = OrdinaryChange |
  RenamedOrCopiedChange |
  UnmergedChange |
  UntrackedChange

/**
 * Converts a given FileStatus value to a human-readable string to be
 * presented to users which describes the state of a file.
 *
 * Typically this will be the same value as that of the enum key.
 *
 * Used in file lists.
 */
export function mapStatus(status: AppFileStatus): string {
  switch (status) {
    case AppFileStatus.New: return 'New'
    case AppFileStatus.Modified: return 'Modified'
    case AppFileStatus.Deleted: return 'Deleted'
    case AppFileStatus.Renamed: return 'Renamed'
    case AppFileStatus.Conflicted: return 'Conflicted'
    case AppFileStatus.Copied: return 'Copied'
  }

  return assertNever(status, `Unknown file status ${status}`)
}

/**
 * Converts a given FileStatus value to an Octicon symbol
 * presented to users when displaying the file path.
 *
 * Used in file lists.
 */
export function iconForStatus(status: AppFileStatus): OcticonSymbol {

  switch (status) {
    case AppFileStatus.New: return OcticonSymbol.diffAdded
    case AppFileStatus.Modified: return OcticonSymbol.diffModified
    case AppFileStatus.Deleted: return OcticonSymbol.diffRemoved
    case AppFileStatus.Renamed: return OcticonSymbol.diffRenamed
    case AppFileStatus.Conflicted: return OcticonSymbol.alert
    case AppFileStatus.Copied: return OcticonSymbol.diffAdded
  }

  return assertNever(status, `Unknown file status ${status}`)
}

export class FileChange {
  /** the relative path to the file in the repository */
  public readonly path: string

  /** The original path in the case of a renamed file */
  public readonly oldPath?: string

  /** the status of the change to the file */
  public readonly status: AppFileStatus

  public constructor(path: string, status: AppFileStatus, oldPath?: string) {
    this.path = path
    this.status = status
    this.oldPath = oldPath
  }

  /** An ID for the file change. */
  public get id(): string {
    return `${this.status}+${this.path}`
  }
}

/** encapsulate the changes to a file in the working directory  */
export class WorkingDirectoryFileChange extends FileChange {

  /** contains the selection details for this file - all, nothing or partial */
  public readonly selection: DiffSelection

  public constructor(path: string, status: AppFileStatus, selection: DiffSelection, oldPath?: string) {
    super(path, status, oldPath)

    this.selection = selection
  }

  /** Create a new WorkingDirectoryFileChange with the given includedness. */
  public withIncludeAll(include: boolean): WorkingDirectoryFileChange {
    const newSelection = include
      ? this.selection.withSelectAll()
      : this.selection.withSelectNone()

    return this.withSelection(newSelection)
  }

  /** Create a new WorkingDirectoryFileChange with the given diff selection. */
  public withSelection(selection: DiffSelection): WorkingDirectoryFileChange {
    return new WorkingDirectoryFileChange(this.path, this.status, selection, this.oldPath)
  }
}

/** the state of the working directory for a repository */
export class WorkingDirectoryStatus {

  /**
   * The list of changes in the repository's working directory
   */
  public readonly files: ReadonlyArray<WorkingDirectoryFileChange> = new Array<WorkingDirectoryFileChange>()

  /**
   * Update the include checkbox state of the form
   * NOTE: we need to track this separately to the file list selection
   *       and perform two-way binding manually when this changes
   */
  public readonly includeAll: boolean | null = true

  public constructor(files: ReadonlyArray<WorkingDirectoryFileChange>, includeAll: boolean | null) {
    this.files = files
    this.includeAll = includeAll
  }

  /**
   * Update the include state of all files in the working directory
   */
  public withIncludeAllFiles(includeAll: boolean): WorkingDirectoryStatus {
    const newFiles = this.files.map(f => f.withIncludeAll(includeAll))
    return new WorkingDirectoryStatus(newFiles, includeAll)
  }

  /** Update by replacing the file with the same ID with a new file. */
  public byReplacingFile(file: WorkingDirectoryFileChange): WorkingDirectoryStatus {
    const newFiles = this.files.map(f => {
      if (f.id === file.id) {
        return file
      } else {
        return f
      }
    })
    return new WorkingDirectoryStatus(newFiles, this.includeAll)
  }

  /** Find the file with the given ID. */
  public findFileWithID(id: string): WorkingDirectoryFileChange | null {
    return this.files.find(f => f.id === id) || null
  }
}
