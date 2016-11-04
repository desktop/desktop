import * as React from 'react'
import { FileChange } from '../../models/status'
import { Commit } from '../../lib/local-git-operations'
import { CommitSummary } from './commit-summary'

interface ICommitSummaryContainerProps {
  readonly commit: Commit | null
  readonly files: ReadonlyArray<FileChange>
  readonly selectedFile: FileChange | null
  readonly onSelectedFileChanged: (file: FileChange) => void
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
                          selectedFile={this.props.selectedFile}
                          onSelectedFileChanged={file => this.props.onSelectedFileChanged(file)}
                          emoji={this.props.emoji}/>
  }

  public render() {
    return (
      <div className='panel' id='commit-summary-container'>
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
