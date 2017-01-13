import * as React from 'react'
import { Commit } from '../../models/commit'
import { EmojiText } from '../lib/emoji-text'
import { IGitHubUser } from '../../lib/dispatcher'
import { Avatar } from '../lib/avatar'
import { RelativeTime } from '../relative-time'

interface ICommitProps {
  readonly commit: Commit
  readonly gitHubUser: IGitHubUser | null
  readonly emoji: Map<string, string>
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    const authorDate = this.props.commit.author.date

    return (
      <div className='commit'>
        <Avatar gitHubUser={this.props.gitHubUser}/>
        <div className='info'>
          <EmojiText className='summary' emoji={this.props.emoji}>{this.props.commit.summary}</EmojiText>
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
      this.props.gitHubUser !== nextProps.gitHubUser
    )
  }
}
