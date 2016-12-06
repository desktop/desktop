import { CommitIdentity } from './commit-identity'

/** A git commit. */
export class Commit {
  /** The commit's SHA. */
  public readonly sha: string

  /** The first line of the commit message. */
  public readonly summary: string

  /** The commit message without the first line and CR. */
  public readonly body: string

  /**
   * Information about the author of this commit.
   * includes name, email and date.
   */
  public readonly author: CommitIdentity

  /** The SHAs for the parents of the commit. */
  public readonly parentSHAs: ReadonlyArray<string>

  public constructor(sha: string, summary: string, body: string, author: CommitIdentity, parentSHAs: ReadonlyArray<string>) {
    this.sha = sha
    this.summary = summary
    this.body = body
    this.author = author
    this.parentSHAs = parentSHAs
  }
}
