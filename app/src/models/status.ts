import { DiffSelectionType, DiffSelection } from './diff'

/** the state of the changed file in the working directory */
export enum FileStatus {
  New,
  Modified,
  Deleted,
  Renamed,
  Conflicted,
  Unknown
}

export class FileChange {
  /** the relative path to the file in the repository */
  public readonly path: string

  /** the status of the change to the file */
  public readonly status: FileStatus

  public constructor(path: string, status: FileStatus) {
    this.path = path
    this.status = status
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

  public constructor(path: string, status: FileStatus, selection: DiffSelection) {
    super(path, status)

    this.selection = selection
  }

  /** Create a new WorkingDirectoryFileChange with the given includedness. */
  public withIncludeAll(include: boolean): WorkingDirectoryFileChange {
    const type = include ? DiffSelectionType.All : DiffSelectionType.None
    const selection = new DiffSelection(type, new Map<number, boolean>())
    return this.withSelection(selection)
  }

  /** Create a new WorkingDirectoryFileChange with the given diff selection. */
  public withSelection(selection: DiffSelection): WorkingDirectoryFileChange {
    return new WorkingDirectoryFileChange(this.path, this.status, selection)
  }

  /** Create a new WorkingDirectoryFileChange with the given line selection. */
  public withDiffLinesSelection(diffLines: Map<number, boolean>): WorkingDirectoryFileChange {

    // TODO: we've duplicated this is in some places
    //       evaluate if we can :fire: this and move it into DiffSelection

    const toArray = Array.from(diffLines.values())

    const allSelected = toArray.every(k => k === true)
    const noneSelected = toArray.every(k => k === false)

    let includeAll = DiffSelectionType.Partial
    if (allSelected) {
      includeAll = DiffSelectionType.All
    } else if (noneSelected) {
      includeAll = DiffSelectionType.None
    }

    const selection = new DiffSelection(includeAll, diffLines)
    return this.withSelection(selection)
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
