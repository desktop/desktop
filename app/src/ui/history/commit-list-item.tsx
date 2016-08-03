import * as React from 'react'
import * as moment from 'moment'
import { Commit } from '../../lib/local-git-operations'

interface ICommitProps {
  commit: Commit
}

/** A component which displays a single commit in a commit list. */
export default class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    const relative = moment(this.props.commit.authorDate).fromNow()
    return (
      <div className='commit'>
        <img className='avatar' src={getAvatarURL(this.props.commit)}/>
        <div className='info'>
          <div className='summary'>{this.props.commit.summary}</div>
          <div className='byline' title={this.props.commit.authorDate.toString()}>{relative} by {this.props.commit.authorName}</div>
        </div>
      </div>
    )
  }

  public shouldComponentUpdate(nextProps: ICommitProps, nextState: void): boolean {
    return this.props.commit.sha !== nextProps.commit.sha || this.props.commit.apiCommit !== nextProps.commit.apiCommit
  }
}

function getAvatarURL(commit: Commit): string {
  const apiCommit = commit.apiCommit
  if (apiCommit) {
    return apiCommit.author.avatarUrl
  }

  return 'https://github.com/hubot.png'
}
