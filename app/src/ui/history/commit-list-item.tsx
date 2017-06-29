import * as React from 'react'
import { Commit } from '../../models/commit'
import { IAvatarUser } from '../../models/avatar'
import { RichText } from '../lib/rich-text'
import { Avatar } from '../lib/avatar'
import { RelativeTime } from '../relative-time'

interface ICommitProps {
  readonly commit: Commit
  readonly user: IAvatarUser | null
  readonly emoji: Map<string, string>
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.Component<ICommitProps, {}> {
  public render() {
    const commit = this.props.commit
    const author = commit.author

    return (
      <div className="commit">
        <Avatar user={this.props.user || undefined} />
        <div className="info">
          <RichText
            className="summary"
            emoji={this.props.emoji}
            text={commit.summary}
            renderUrlsAsLinks={false}
          />
          <div className="byline">
            <RelativeTime date={author.date} /> by {author.name}
          </div>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps): boolean {
    return (
      this.props.commit.sha !== nextProps.commit.sha ||
      this.props.user !== nextProps.user
    )
  }
}
