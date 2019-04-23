import { CommitIdentity } from './commit-identity'
import { ITrailer, isCoAuthoredByTrailer } from '../lib/git/interpret-trailers'
import { GitAuthor } from './git-author'

/** Grouping of information required to create a commit */
export interface ICommitContext {
  /**
   * The summary of the commit message (required)
   */
  readonly summary: string
  /**
   * Additional details for the commit message (optional)
   */
  readonly description: string | null
  /**
   * An optional array of commit trailers (for example Co-Authored-By trailers) which will be appended to the commit message in accordance with the Git trailer configuration.
   */
  readonly trailers?: ReadonlyArray<ITrailer>
}

/**
 * Extract any Co-Authored-By trailers from an array of arbitrary
 * trailers.
 */
function extractCoAuthors(trailers: ReadonlyArray<ITrailer>) {
  const coAuthors = []

  for (const trailer of trailers) {
    if (isCoAuthoredByTrailer(trailer)) {
      const author = GitAuthor.parse(trailer.value)
      if (author) {
        coAuthors.push(author)
      }
    }
  }

  return coAuthors
}

/**
 * A minimal shape of data to represent a commit, for situations where the
 * application does not require the full commit metadata.
 *
 * Equivalent to the output where Git command support the
 * `--oneline --no-abbrev-commit` arguments to format a commit.
 */
export type CommitOneLine = {
  /** The full commit id associated with the commit */
  readonly sha: string
  /** The first line of the commit message */
  readonly summary: string
}

/** A git commit. */
export class Commit {
  /**
   * A list of co-authors parsed from the commit message
   * trailers.
   */
  public readonly coAuthors: ReadonlyArray<GitAuthor>

  /**
   * A value indicating whether the author and the committer
   * are the same person.
   */
  public readonly authoredByCommitter: boolean

  /**
   * @param sha The commit's SHA.
   * @param shortSha The commit's shortSHA.
   * @param summary The first line of the commit message.
   * @param body The commit message without the first line and CR.
   * @param author Information about the author of this commit.
   *               Includes name, email and date.
   * @param committer Information about the committer of this commit.
   *                 Includes name, email and date.
   * @param parentSHAS The SHAs for the parents of the commit.
   * @param trailers Parsed, unfolded trailers from the commit message body,
   *                 if any, as interpreted by `git interpret-trailers`
   */
  public constructor(
    public readonly sha: string,
    public readonly shortSha: string,
    public readonly summary: string,
    public readonly body: string,
    public readonly author: CommitIdentity,
    public readonly committer: CommitIdentity,
    public readonly parentSHAs: ReadonlyArray<string>,
    public readonly trailers: ReadonlyArray<ITrailer>
  ) {
    this.coAuthors = extractCoAuthors(trailers)

    this.authoredByCommitter =
      this.author.name === this.committer.name &&
      this.author.email === this.committer.email
  }
}
