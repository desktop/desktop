/** A git commit. */
export class Commit {
  /** The commit's SHA. */
  public readonly sha: string

  /** The first line of the commit message. */
  public readonly summary: string

  /** The commit message without the first line and CR. */
  public readonly body: string

  /** The commit author's name */
  public readonly authorName: string

  /** The commit author's email address */
  public readonly authorEmail: string

  /** The commit timestamp (with timezone information) */
  public readonly authorDate: Date

  /** The SHAs for the parents of the commit. */
  public readonly parentSHAs: ReadonlyArray<string>

  public constructor(sha: string, summary: string, body: string, authorName: string, authorEmail: string, authorDate: Date, parentSHAs: ReadonlyArray<string>) {
    this.sha = sha
    this.summary = summary
    this.body = body
    this.authorName = authorName
    this.authorEmail = authorEmail
    this.authorDate = authorDate
    this.parentSHAs = parentSHAs
  }
}
