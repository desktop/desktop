import * as React from 'react'
import { Commit } from '../../lib/local-git-operations'
import { EmojiText } from '../lib/emoji-text'
import { RelativeTime } from '../relative-time'

const DefaultAvatarURL = 'https://github.com/hubot.png'

interface ICommitProps {
  readonly commit: Commit
  readonly avatarURL: string | null
  readonly emoji: Map<string, string>
}

/** A component which displays a single commit in a commit list. */
export class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    const authorDate = this.props.commit.authorDate
    const avatarURL = this.props.avatarURL || DefaultAvatarURL
    return (
      <div className='commit'>
        <img className='avatar' src={avatarURL}/>
        <div className='info'>
          <EmojiText className='summary' emoji={this.props.emoji}>{this.props.commit.summary}</EmojiText>
          <div className='byline' title={this.props.commit.authorDate.toString()}>
            <RelativeTime date={authorDate} /> by {this.props.commit.authorName}
          </div>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps, nextState: void): boolean {
    return (
      this.props.commit.sha !== nextProps.commit.sha ||
      this.props.avatarURL !== nextProps.avatarURL
    )
  }
}
