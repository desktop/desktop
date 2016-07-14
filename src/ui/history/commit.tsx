import * as React from 'react'
import {Commit as CommitModel} from '../../lib/local-git-operations'

interface ICommitProps {
  commit: CommitModel
}

/** A component which displays a single commit in a commit list. */
export default class Commit extends React.Component<ICommitProps, void> {
  public render() {
    return <div className='commit'>{this.props.commit.getSummary()}</div>
  }
}
