export class SubmoduleEntry {
  public readonly sha: string
  public readonly path: string
  public readonly nearestTag: string

  public constructor(sha: string, path: string, nearestTag: string) {
    this.sha = sha
    this.path = path
    this.nearestTag = nearestTag
  }
}
