export class SubmoduleEntry {
  public readonly sha: string
  public readonly path: string
  public readonly describe: string

  public constructor(sha: string, path: string, describe: string) {
    this.sha = sha
    this.path = path
    this.describe = describe
  }
}
