import * as React from 'react'
import CommitList from './commit-list'
import CommitSummaryContainer from './commit-summary-container'
import FileDiff from '../file-diff'
import Repository from '../../models/repository'
import {FileChange} from '../../models/status'
import { Commit } from '../../lib/local-git-operations'
import { Dispatcher } from '../../lib/dispatcher'
import { IHistoryState } from '../../lib/app-state'

interface IHistoryProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly history: IHistoryState
}

/** The History component. Contains the commit list, commit summary, and diff. */
export default class History extends React.Component<IHistoryProps, void> {
  private onCommitSelected(commit: Commit) {
    const newSelection = {commit, file: null}
    this.props.dispatcher.changeHistorySelection(this.props.repository, newSelection)
  }

  private onFileSelected(file: FileChange) {
    const newSelection = {commit: this.props.history.selection.commit, file}
    this.props.dispatcher.changeHistorySelection(this.props.repository, newSelection)
  }

  public render() {
    const commit = this.props.history.selection.commit
    const selectedFile = this.props.history.selection.file
    return (
      <div id='history'>
        <CommitList commits={this.props.history.commits}
                    selectedCommit={this.props.history.selection.commit}
                    onCommitSelected={row => this.onCommitSelected(row)}/>
        <CommitSummaryContainer repository={this.props.repository}
                                commit={commit}
                                files={this.props.history.changedFiles}
                                selectedFile={this.props.history.selection.file}
                                onSelectedFileChanged={file => this.onFileSelected(file)}/>
        <FileDiff path={selectedFile ? selectedFile.path : null}/>
      </div>
    )
  }
}
