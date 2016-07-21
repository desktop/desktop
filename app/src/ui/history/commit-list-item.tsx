import * as React from 'react'
import {Commit} from '../../lib/local-git-operations'

interface ICommitProps {
  commit: Commit
}

/** A component which displays a single commit in a commit list. */
export default class CommitListItem extends React.Component<ICommitProps, void> {
  public render() {
    return <div className='commit'>{this.props.commit.summary}</div>
  }
}
