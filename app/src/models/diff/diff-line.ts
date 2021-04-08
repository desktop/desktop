/** indicate what a line in the diff represents */
export enum DiffLineType {
  Context,
  Add,
  Delete,
  Hunk,
}

/** track details related to each line in the diff */
export class DiffLine {
  public constructor(
    public readonly text: string,
    public readonly type: DiffLineType,
    // Line number in the original diff patch (before expanding it), or null if
    // it was added as part of a diff expansion action.
    public readonly originalLineNumber: number | null,
    public readonly oldLineNumber: number | null,
    public readonly newLineNumber: number | null,
    public readonly noTrailingNewLine: boolean = false
  ) {}

  public withNoTrailingNewLine(noTrailingNewLine: boolean): DiffLine {
    return new DiffLine(
      this.text,
      this.type,
      this.originalLineNumber,
      this.oldLineNumber,
      this.newLineNumber,
      noTrailingNewLine
    )
  }

  public isIncludeableLine() {
    return this.type === DiffLineType.Add || this.type === DiffLineType.Delete
  }

  /** The content of the line, i.e., without the line type marker. */
  public get content(): string {
    return this.text.substr(1)
  }
}
