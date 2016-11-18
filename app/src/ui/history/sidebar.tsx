import * as React from 'react'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Dispatcher, IGitHubUser } from '../../lib/dispatcher'
import { IHistoryState } from '../../lib/app-state'
import { ThrottledScheduler } from '../lib/throttled-scheduler'

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

interface IHistorySidebarProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly history: IHistoryState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commits: Map<string, Commit>
}

/** The History component. Contains the commit list, commit summary, and diff. */
export class HistorySidebar extends React.Component<IHistorySidebarProps, void> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  private onCommitChanged = (commit: Commit) => {
    this.props.dispatcher.changeHistoryCommitSelection(this.props.repository, commit.sha)

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(this.props.repository)
    })
  }

  private onScroll = (start: number, end: number) => {
    const history = this.props.history.history
    if (history.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }

  public componentWillUnmount() {
    this.loadChangedFilesScheduler.clear()
  }

  public render() {
    return (
      <CommitList
        commits={this.props.commits}
        history={this.props.history.history}
        selectedSHA={this.props.history.selection.sha}
        onCommitChanged={this.onCommitChanged}
        onScroll={this.onScroll}
        gitHubUsers={this.props.gitHubUsers}
        emoji={this.props.emoji}
      />
    )
  }
}
