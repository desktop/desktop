import { CommitIdentity } from './commit-identity'
import { ITrailer } from '../lib/git/interpret-trailers'
import { GitAuthor } from './git-author'

function extractCoAuthors(trailers: ReadonlyArray<ITrailer>) {
  const coAuthors = []

  for (const trailer of trailers) {
    if (trailer.token.toLowerCase() === 'co-authored-by') {
      const author = GitAuthor.parse(trailer.value)
      if (author) {
        coAuthors.push(author)
      }
    }
  }

  return coAuthors
}

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

  /**
   * Parsed, unfolded trailers from the commit message body,
   * if any, as interpreted by `git interpret-trailers`
   */
  public readonly trailers: ReadonlyArray<ITrailer>

  /**
   * A list of co-authors parsed from the commit message
   * trailers.
   */
  public readonly coAuthors: ReadonlyArray<GitAuthor>

  public constructor(
    sha: string,
    summary: string,
    body: string,
    author: CommitIdentity,
    parentSHAs: ReadonlyArray<string>,
    trailers: ReadonlyArray<ITrailer>
  ) {
    this.sha = sha
    this.summary = summary
    this.body = body
    this.author = author
    this.parentSHAs = parentSHAs
    this.trailers = trailers
    this.coAuthors = extractCoAuthors(trailers)

    if (this.coAuthors.length) {
      console.log(
        `${this.sha}: ${this.coAuthors.map(a => a.toString()).join(', ')}`
      )
    }
  }
}
