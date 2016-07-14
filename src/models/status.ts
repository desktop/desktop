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
  public included: boolean = true

  public constructor(path: string, status: FileStatus) {
    this.path = path
    this.status = status
  }
}

/** the state of the working directory for a repository */
export class WorkingDirectoryStatus {

  public readonly files: WorkingDirectoryFileChange[] = []

  public add(path: string, status: FileStatus): void {
    this.files.push(new WorkingDirectoryFileChange(path, status))
  }
}
