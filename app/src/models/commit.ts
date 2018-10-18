import { CommitIdentity } from './commit-identity'
import { ITrailer, isCoAuthoredByTrailer } from '../lib/git/interpret-trailers'
import { GitAuthor } from './git-author'
import { GitHubRepository } from './github-repository'
import { getDotComAPIEndpoint } from '../lib/api'

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

  /**
   * Best-effort attempt to figure out if this commit was committed using
   * the web flow on GitHub.com or GitHub Enterprise. Web flow
   * commits (such as PR merges) will have a special GitHub committer
   * with a noreply email address.
   *
   * For GitHub.com we can be spot on but for GitHub Enterprise it's
   * possible we could fail if they've set up a custom smtp host
   * that doesn't correspond to the hostname.
   */
  public isWebFlowCommitter(gitHubRepository: GitHubRepository) {
    if (!gitHubRepository) {
      return false
    }

    const endpoint = gitHubRepository.owner.endpoint
    const { name, email } = this.committer

    if (
      endpoint === getDotComAPIEndpoint() &&
      name === 'GitHub' &&
      email === 'noreply@github.com'
    ) {
      return true
    }

    if (this.committer.name === 'GitHub Enterprise') {
      const host = new URL(endpoint).host.toLowerCase()
      return email.endsWith(`@${host}`)
    }

    return false
  }
}
