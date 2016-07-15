/** the state of the changed file in the working directory */
export enum FileStatus {
  New,
  Modified,
  Deleted,
  Renamed,
  Conflicted,
  Unknown
}

/** encapsulate the changes to a file in the working directory  */
export class WorkingDirectoryFileChange {
  /** the relative path to the file in the repository */
  public readonly path: string

  /** the status of the change to the file */
  public readonly status: FileStatus

  /** whether the file should be included in the next commit */
  public include: boolean = true

  public constructor(path: string, status: FileStatus) {
    this.path = path
    this.status = status
  }
}

/** the state of the working directory for a repository */
export class WorkingDirectoryStatus {

  /**
   * The list of changes in the repository's working directory
   */
  public readonly files: WorkingDirectoryFileChange[] = []

  /**
   * Update the include checkbox state of the form
   * NOTE: we need to track this separately to the file list selection
   *       and perform two-way binding manually when this changes
   */
  public includeAll: boolean | null = true

  /**
   * Update the include state of all files in the working directory
   */
  public includeAllFiles(includeAll: boolean) {
    this.files.forEach(file => {
      file.include = includeAll
    })
  }

  /**
   * Add a new file to the working directory list
   */
  public add(path: string, status: FileStatus): void {
    const file = new WorkingDirectoryFileChange(path, status)
    if (this.includeAll) {
      file.include = this.includeAll
    } else {
      file.include = true
    }
    this.files.push(file)
  }
}
