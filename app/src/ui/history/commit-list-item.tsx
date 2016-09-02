import * as React from 'react'
import * as moment from 'moment'
import { Commit } from '../../lib/local-git-operations'
import { IGitHubUser } from '../../lib/dispatcher'

const DefaultAvatarURL = 'https://github.com/hubot.png'

interface ICommitProps {
  readonly commit: Commit
  readonly gitHubUser: IGitHubUser | null
}

/** A component which displays a single commit in a commit list. */
export default class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    const relative = moment(this.props.commit.authorDate).fromNow()
    const avatarURL = this.props.gitHubUser ? this.props.gitHubUser.avatarURL : DefaultAvatarURL
    return (
      <div className='commit'>
        <img className='avatar' src={avatarURL}/>
        <div className='info'>
          <div className='summary'>{this.props.commit.summary}</div>
          <div className='byline' title={this.props.commit.authorDate.toString()}>{relative} by {this.props.commit.authorName}</div>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps, nextState: void): boolean {
    return (
      this.props.commit.sha !== nextProps.commit.sha ||
      this.props.gitHubUser !== nextProps.gitHubUser
    )
  }
}
