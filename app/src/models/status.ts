import { DiffSelection } from './diff'
import { assertNever } from '../lib/fatal-error'

/** the state of the changed file in the working directory */
export enum FileStatus {
  New,
  Modified,
  Deleted,
  Renamed,
  Conflicted,
  Copied,
}

/** convert the file status to a string */
export function mapStatus(status: FileStatus): string {
  switch (status) {
    case FileStatus.New: return 'New'
    case FileStatus.Modified: return 'Modified'
    case FileStatus.Deleted: return 'Deleted'
    case FileStatus.Renamed: return 'Renamed'
    case FileStatus.Conflicted: return 'Conflicted'
    case FileStatus.Copied: return 'Copied'
  }

  return assertNever(status, `Unknown file status ${status}`)
}

export class FileChange {
  /** the relative path to the file in the repository */
  public readonly path: string

  /** The original path in the case of a renamed file */
  public readonly oldPath?: string

  /** the status of the change to the file */
  public readonly status: FileStatus

  public constructor(path: string, status: FileStatus, oldPath?: string) {
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

  public constructor(path: string, status: FileStatus, selection: DiffSelection, oldPath?: string) {
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
}
