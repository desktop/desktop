import { Commit } from '../../models/commit'
import * as React from 'react'
import { CommitIdentity } from '../../models/commit-identity'
import { GitAuthor } from '../../models/git-author'

interface ICommitAttributionProps {
  readonly commit: Commit
}

export class CommitAttribution extends React.Component<
  ICommitAttributionProps,
  {}
> {
  private renderAuthorInline(author: CommitIdentity | GitAuthor) {
    return <span className="author">{author.name}</span>
  }

  private renderAuthors(
    authors: ReadonlyArray<CommitIdentity | GitAuthor>,
    committerAttribution: boolean
  ) {
    if (authors.length === 1) {
      return (
        <span className="authors">{this.renderAuthorInline(authors[0])}</span>
      )
    } else if (authors.length === 2 && !committerAttribution) {
      return (
        <span className="authors">
          {this.renderAuthorInline(authors[0])}
          {' and '}
          {this.renderAuthorInline(authors[1])}
        </span>
      )
    } else {
      const title = authors.map(a => a.name).join(', ')

      return (
        <span className="authors" title={title}>
          {authors.length} people
        </span>
      )
    }
  }

  private renderCommitter(committer: CommitIdentity) {
    return (
      <span className="committer">
        {' and '}
        {this.renderAuthorInline(committer)}
        {' committed'}
      </span>
    )
  }

  public render() {
    const commit = this.props.commit
    const { author, committer, coAuthors } = commit

    const authors: Array<CommitIdentity | GitAuthor> = [author, ...coAuthors]

    const committerAttribution = !commit.authoredByCommitter

    return (
      <span>
        {this.renderAuthors(authors, committerAttribution)}
        {committerAttribution ? ' authored' : ' committed'}
        {committerAttribution ? this.renderCommitter(committer) : null}
      </span>
    )
  }
}
