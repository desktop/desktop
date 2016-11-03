import * as React from 'react'
import { Repository } from '../../models/repository'
import { FileChange } from '../../models/status'
import { Commit } from '../../lib/local-git-operations'
import { CommitSummary } from './commit-summary'

interface ICommitSummaryContainerProps {
  readonly repository: Repository
  readonly commit: Commit | null
  readonly files: ReadonlyArray<FileChange>
  readonly emoji: Map<string, string>
}

/** A component which displays a commit's summary. */
export class CommitSummaryContainer extends React.Component<ICommitSummaryContainerProps, void> {
  private renderCommit() {
    if (!this.props.commit) {
      return <NoCommitSelected/>
    }

    return <CommitSummary summary={this.props.commit.summary}
                          body={this.props.commit.body}
                          sha={this.props.commit.sha}
                          authorName={this.props.commit.authorName}
                          files={this.props.files}
                          emoji={this.props.emoji}/>
  }

  public render() {
    return (
      <div id='commit-summary-container'>
        {this.renderCommit()}
      </div>
    )
  }
}

function NoCommitSelected() {
  return (
    <div className='panel blankslate'>
      No commit selected
    </div>
  )
}
