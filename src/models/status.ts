/** the state of the changed file in the working directory */
export enum FileStatus {
  New,
  Modified,
  Deleted,
  Ignored,
  Unknown
}

/** encapsulate the changes to a file in the working directory  */
export class WorkingDirectoryFileChange {
  private path: string
  private status: FileStatus
  private included: boolean = true

  public constructor(path: string, status: FileStatus) {
    this.path = path
    this.status = status
  }

  /** the relative path to the file in the repository */
  public getPath(): string {
    return this.path
  }

  /** the status of the change to the file */
  public getStatus(): number {
    return this.status
  }

  /** whether the file should be included in the next commit */
  public getIncluded(): boolean {
    return this.included
  }

  public setIncluded(included: boolean) {
    this.included = included
  }
}

/** the state of the working directory for a repository */
export class WorkingDirectoryStatus {

  private files: WorkingDirectoryFileChange[]

  public constructor() {
     this.files = new Array<WorkingDirectoryFileChange>()
  }

  public add(path: string, status: FileStatus): void {
    this.files.push(new WorkingDirectoryFileChange(path, status))
  }

  public getFiles(): WorkingDirectoryFileChange[] {
    return this.files
  }
}
