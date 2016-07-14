import * as React from 'react'
import {Commit} from '../../lib/local-git-operations'

interface ICommitSummaryProps {
  commit: Commit
}

/** A component which displays a commit's summary. */
export default class CommitSummary extends React.Component<ICommitSummaryProps, void> {
  private renderNoCommitSelected() {
    return <div>No commit selected</div>
  }

  private renderCommit() {
    return (
      <div>
        <div>{this.props.commit.getSummary()}</div>
        <div>{this.props.commit.getBody()}</div>
      </div>
    )
  }

  public render() {
    return (
      <div id='commit-summary'>
        {this.props.commit ? this.renderCommit() : this.renderNoCommitSelected()}
      </div>
    )
  }
}
