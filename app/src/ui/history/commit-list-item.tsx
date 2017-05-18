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
export class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    const authorDate = this.props.commit.author.date

    return (
      <div className='commit'>
        <Avatar user={this.props.user || undefined}/>
        <div className='info'>
          <RichText
            className='summary'
            emoji={this.props.emoji}
            text={this.props.commit.summary}
            renderUrlsAsLinks={false} />
          <div className='byline'>
            <RelativeTime date={authorDate} /> by {this.props.commit.author.name}
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
