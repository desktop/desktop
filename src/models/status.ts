export class WorkingDirectoryFileChange {
  private path: string
  private status: number

  public constructor(path: string, status: number) {
    this.path = path
    this.status = status
  }

  public getPath(): string {
    return this.path
  }

  public getStatus(): number {
    return this.status
  }
}

export class WorkingDirectoryStatus {

  private files: WorkingDirectoryFileChange[]

  public constructor() {
     this.files = new Array<WorkingDirectoryFileChange>()
  }

  public add(path: string, status: number): void {
    this.files.push(new WorkingDirectoryFileChange(path, status))
  }

  public getFiles(): WorkingDirectoryFileChange[] {
    return this.files
  }
}
