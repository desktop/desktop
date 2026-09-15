import * as React from 'react'
import { IAvatarUser } from '../../models/avatar'

interface ICommitAttributionProps {
  /**
   * The authors attributable to this commit
   */
  readonly avatarUsers: ReadonlyArray<IAvatarUser>
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
  private renderAuthorInline(author: IAvatarUser) {
    return <span className="author">{author.name}</span>
  }

  private renderAuthors(authors: ReadonlyArray<IAvatarUser>) {
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
    return (
      <span className="commit-attribution-component">
        {this.renderAuthors(this.props.avatarUsers)}
      </span>
    )
  }
}
