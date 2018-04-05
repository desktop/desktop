import * as React from 'react'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../../lib/dispatcher'
import { IGitHubUser } from '../../lib/databases'
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
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

/** The History component. Contains the commit list, commit summary, and diff. */
export class HistorySidebar extends React.Component<IHistorySidebarProps, {}> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  private onCommitSelected = (commit: Commit) => {
    this.props.dispatcher.changeHistoryCommitSelection(
      this.props.repository,
      commit.sha
    )

    this.loadChangedFilesScheduler.queue(() => {
      this.props.dispatcher.loadChangedFilesForCurrentSelection(
        this.props.repository
      )
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
        gitHubRepository={this.props.repository.gitHubRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={this.props.history.history}
        selectedSHA={this.props.history.selection.sha}
        onCommitSelected={this.onCommitSelected}
        onScroll={this.onScroll}
        gitHubUsers={this.props.gitHubUsers}
        emoji={this.props.emoji}
        localCommitSHAs={this.props.localCommitSHAs}
        onRevertCommit={this.props.onRevertCommit}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        emptyListMessage={'No history'}
      />
    )
  }
}
