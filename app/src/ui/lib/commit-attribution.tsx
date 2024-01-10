import { Commit } from '../../models/commit'
import * as React from 'react'
import { CommitIdentity } from '../../models/commit-identity'
import { GitAuthor } from '../../models/git-author'
import { GitHubRepository } from '../../models/github-repository'
import { isWebFlowCommitter } from '../../lib/web-flow-committer'

interface ICommitAttributionProps {
  /**
   * The commit or commits from where to extract the author, committer
   * and co-authors from.
   */
  readonly commits: ReadonlyArray<Commit>

  /**
   * The GitHub hosted repository that the given commit is
   * associated with or null if repository is local or
   * not associated with a GitHub account. Used to determine
   * whether a commit is a special GitHub web flow user.
   */
  readonly gitHubRepository: GitHubRepository | null
}

/**
 * A component used for listing the authors involved in
 * a commit, formatting the content as close to what
 * GitHub.com does as possible.
 */
export class CommitAttribution extends React.Component<
  ICommitAttributionProps,
  {}
> {
  private renderAuthorInline(author: CommitIdentity | GitAuthor) {
    return <span className="author">{author.name}</span>
  }

  private renderAuthors(authors: ReadonlyArray<CommitIdentity | GitAuthor>) {
    if (authors.length === 1) {
      return (
        <span className="authors">{this.renderAuthorInline(authors[0])}</span>
      )
    } else if (authors.length === 2) {
      return (
        <span className="authors">
          {this.renderAuthorInline(authors[0])}
          {`, `}
          {this.renderAuthorInline(authors[1])}
        </span>
      )
    } else {
      return <span className="authors">{authors.length} people</span>
    }
  }

  public render() {
    const { commits } = this.props

    const allAuthors = new Map<string, CommitIdentity | GitAuthor>()
    for (const commit of commits) {
      const { author, committer, coAuthors } = commit

      // do we need to attribute the committer separately from the author?
      const committerAttribution =
        !commit.authoredByCommitter &&
        !(
          this.props.gitHubRepository !== null &&
          isWebFlowCommitter(commit, this.props.gitHubRepository)
        )

      const authors: Array<CommitIdentity | GitAuthor> = committerAttribution
        ? [author, committer, ...coAuthors]
        : [author, ...coAuthors]

      for (const a of authors) {
        if (!allAuthors.has(a.toString())) {
          allAuthors.set(a.toString(), a)
        }
      }
    }

    return (
      <span className="commit-attribution-component">
        {this.renderAuthors(Array.from(allAuthors.values()))}
      </span>
    )
  }
}
