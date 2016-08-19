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


/** encapsulate the selection of changes to a modified file in the working directory  */
export class DiffSelection {
  /** by default, the diff selection to include all lines */
  private readonly includeAll: boolean | null = true
  /**
      once the user has started selecting specific lines to include,
      these selections are tracked here
  */
  public readonly selectedLines: Map<number, boolean>

  public constructor(includeAll: boolean | null, selectedLines: Map<number, boolean>) {
    this.includeAll = includeAll
    this.selectedLines = selectedLines
  }

  /** check if all lines are selected in the diff */
  public isIncludeAll(): boolean | null {
    if (this.selectedLines.size === 0) {
      return this.includeAll
    } else {
      const toArray = Array.from(this.selectedLines.values())
      const allSelected = toArray.every(k => k === true)
      const noneSelected = toArray.every(k => k === false)

      let includeAll: boolean | null = null
      if (allSelected) {
        includeAll = true
      } else if (noneSelected) {
        includeAll = false
      }

      return includeAll
    }
  }
}

/** encapsulate the changes to a file in the working directory  */
export class WorkingDirectoryFileChange extends FileChange {

  /** whether the file should be included in the next commit */
  public readonly diffSelection: DiffSelection
  public constructor(path: string, status: FileStatus, diffSelection: DiffSelection) {
    super(path, status)

    this.diffSelection = diffSelection
  }

  /** Create a new WorkingDirectoryFileChange with the given includedness. */
  public withIncludeAll(include: boolean): WorkingDirectoryFileChange {
    const selection = new DiffSelection(include, new Map<number, boolean>())
    return this.withDiffSelection(selection)
  }

  /** Create a new WorkingDirectoryFileChange with the given diff selection. */
  public withDiffSelection(selection: DiffSelection): WorkingDirectoryFileChange {
    return new WorkingDirectoryFileChange(this.path, this.status, selection)
  }

  /** Create a new WorkingDirectoryFileChange with the given line selection. */
  public withDiffLinesSelection(diffLines: Map<number, boolean>): WorkingDirectoryFileChange {

    // TODO: we've duplicated this is in some places
    //       evaluate if we can :fire: this and move it into DiffSelection

    const toArray = Array.from(diffLines.values())

    const allSelected = toArray.every(k => k === true)
    const noneSelected = toArray.every(k => k === false)

    let includeAll: boolean | null = null
    if (allSelected) {
      includeAll = true
    } else if (noneSelected) {
      includeAll = false
    }

    const selection = new DiffSelection(includeAll, diffLines)
    return this.withDiffSelection(selection)
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
