import * as React from 'react'
import * as moment from 'moment'
import { Commit } from '../../lib/local-git-operations'
import { IGitUser } from '../../lib/dispatcher'
import EmojiText from '../lib/emoji-text'

interface ICommitProps {
  readonly commit: Commit
  readonly gitUser: IGitUser
  readonly emoji: Map<string, string>
}

/** A component which displays a single commit in a commit list. */
export default class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    const relative = moment(this.props.commit.authorDate).fromNow()
    return (
      <div className='commit'>
        <img className='avatar' src={this.props.gitUser.avatarURL}/>
        <div className='info'>
          <EmojiText className='summary' emoji={this.props.emoji}>{this.props.commit.summary}</EmojiText>
          <div className='byline' title={this.props.commit.authorDate.toString()}>{relative} by {this.props.commit.authorName}</div>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps, nextState: void): boolean {
    return (
      this.props.commit.sha !== nextProps.commit.sha ||
      this.props.gitUser.avatarURL !== nextProps.gitUser.avatarURL
    )
  }
}
