import * as React from 'react'
import { CommitSummary } from './commit-summary'
import { Diff } from '../diff'
import { FileList } from './file-list'
import { Repository } from '../../models/repository'
import { FileChange } from '../../models/status'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../../lib/dispatcher'
import { IHistoryState } from '../../lib/app-state'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { Resizable } from '../resizable'

// At some point we'll make index.tsx only be exports
// see https://github.com/desktop/desktop/issues/383
export { HistorySidebar } from './sidebar'

interface IHistoryProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly history: IHistoryState
  readonly emoji: Map<string, string>
  readonly commits: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly commitSummaryWidth: number
}

/** The History component. Contains the commit list, commit summary, and diff. */
export class History extends React.Component<IHistoryProps, void> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  private onFileSelected = (file: FileChange) => {
    this.props.dispatcher.changeHistoryFileSelection(this.props.repository, file)
  }

  public componentWillUnmount() {
    this.loadChangedFilesScheduler.clear()
  }

  private renderDiff(commit: Commit | null) {

    const file = this.props.history.selection.file
    const diff = this.props.history.diff

    if (!diff || !file) {
      return (
        <div className='panel blankslate' id='diff'>
          No file selected
        </div>
      )
    }

    return (
      <Diff repository={this.props.repository}
        file={file}
        diff={diff}
        readOnly={true}
        dispatcher={this.props.dispatcher} />
    )
  }

  private renderCommitSummary(commit: Commit) {
    const isLocal = this.props.localCommitSHAs.indexOf(commit.sha) > -1

    return <CommitSummary
      summary={commit.summary}
      body={commit.body}
      sha={commit.sha}
      author={commit.author}
      files={this.props.history.changedFiles}
      emoji={this.props.emoji}
      repository={this.props.repository}
      isLocal={isLocal}
    />
  }

  private onCommitSummaryReset = () => {
    this.props.dispatcher.resetCommitSummaryWidth()
  }

  private onCommitSummaryResize = (width: number) => {
    this.props.dispatcher.setCommitSummaryWidth(width)
  }


  public render() {
    const sha = this.props.history.selection.sha
    const commit = sha ? (this.props.commits.get(sha) || null) : null

    if (!sha || !commit) {
      return <NoCommitSelected/>
    }

    // -1 for right hand side border
    const availableWidth = this.props.commitSummaryWidth - 1

    return (
      <div id='history'>
        {this.renderCommitSummary(commit)}
        <div id='commit-details'>
          <Resizable
            width={this.props.commitSummaryWidth}
            onResize={this.onCommitSummaryResize}
            onReset={this.onCommitSummaryReset}
          >
            <FileList
              files={this.props.history.changedFiles}
              onSelectedFileChanged={this.onFileSelected}
              selectedFile={this.props.history.selection.file}
              availableWidth={availableWidth}
            />
          </Resizable>
          { this.renderDiff(commit) }
        </div>
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
