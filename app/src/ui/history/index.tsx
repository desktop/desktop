import * as React from 'react'
import { CommitList } from './commit-list'
import { CommitSummaryContainer } from './commit-summary-container'
import { Diff } from '../diff'
import { Repository } from '../../models/repository'
import { FileChange } from '../../models/status'
import { Commit } from '../../lib/local-git-operations'
import { Dispatcher, IGitHubUser } from '../../lib/dispatcher'
import { IHistoryState } from '../../lib/app-state'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { PersistingResizable } from '../resizable'

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

interface IHistoryProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly history: IHistoryState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commits: Map<string, Commit>
}

/** The History component. Contains the commit list, commit summary, and diff. */
export class History extends React.Component<IHistoryProps, void> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  private onCommitChanged(commit: Commit) {
    this.props.dispatcher.changeHistoryCommitSelection(this.props.repository, commit.sha)

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(this.props.repository)
    })
  }

  private onFileSelected(file: FileChange) {
    this.props.dispatcher.changeHistoryFileSelection(this.props.repository, file)
  }

  private onScroll(start: number, end: number) {
    const history = this.props.history.history
    if (history.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
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

  public render() {
    const sha = this.props.history.selection.sha
    const commit = sha ? (this.props.commits.get(sha) || null) : null

    return (
      <div className='panel-container' id='history'>
        <PersistingResizable configKey='commit-list-width'>
          <CommitList commits={this.props.commits}
                      history={this.props.history.history}
                      selectedSHA={this.props.history.selection.sha}
                      onCommitChanged={commit => this.onCommitChanged(commit)}
                      onScroll={(start, end) => this.onScroll(start, end)}
                      repository={this.props.repository}
                      gitHubUsers={this.props.gitHubUsers}
                      dispatcher={this.props.dispatcher}
                      emoji={this.props.emoji}/>
        </PersistingResizable>
        <PersistingResizable configKey='commit-summary-width'>
          <CommitSummaryContainer repository={this.props.repository}
                                  commit={commit}
                                  files={this.props.history.changedFiles}
                                  selectedFile={this.props.history.selection.file}
                                  onSelectedFileChanged={file => this.onFileSelected(file)}
                                  emoji={this.props.emoji}/>
        </PersistingResizable>
        { this.renderDiff(commit) }
      </div>
    )
  }
}
