export class FileSummary {
  /**
   * The number of lines added as part of this change.
   *
   * If the file is a binary change, this value is undefined.
   */
  public readonly added?: number
  /**
   * The number of lines removed as part of this change.
   *
   * If the file is a binary change, this value is undefined.
   */
  public readonly removed?: number

  /**
   * The path to this change, relative to the submodule root
   */
  public readonly path: string

  public constructor(
    path: string,
    added: number | undefined,
    removed: number | undefined
  ) {
    this.path = path
    this.added = added
    this.removed = removed
  }

  /** An ID for the file change. */
  public get id(): string {
    return `${this.added}+${this.removed}+${this.path}`
  }
}
