import * as React from 'react'
import Repository from '../../models/repository'
import { FileChange } from '../../models/status'
import { Commit } from '../../lib/local-git-operations'
import CommitSummary from './commit-summary'

interface ICommitSummaryContainerProps {
  readonly repository: Repository
  readonly commit: Commit | null
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
}

/** A component which displays a commit's summary. */
export default class CommitSummaryContainer extends React.Component<ICommitSummaryContainerProps, void> {
  private renderCommit() {
    if (!this.props.commit) {
      return <NoCommitSelected/>
    }

    return <CommitSummary summary={this.props.commit.summary}
                          body={this.props.commit.body}
                          files={this.props.files}
                          selectedFile={this.props.selectedFile}
                          onSelectedFileChanged={file => this.props.onSelectedFileChanged(file)}/>
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
    <div className='blankslate'>
      No commit selected
    </div>
  )
}
