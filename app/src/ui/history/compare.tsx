import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import { IHistoryState } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly history: IHistoryState
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

export class CompareSidebar extends React.Component<ICompareSidebarProps, {}> {
  public render() {
    return (
      <div id="compare">
        {this.renderBranchList()}
        {this.renderTabBar()}
        <CommitList
          gitHubRepository={this.props.repository.gitHubRepository}
          commitLookup={this.props.commitLookup}
          commits={this.props.history.history}
          selectedSHA={this.props.history.selection.sha}
          gitHubUsers={this.props.gitHubUsers}
          localCommitSHAs={this.props.localCommitSHAs}
          emoji={this.props.emoji}
          onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
          onRevertCommit={this.props.onRevertCommit}
          onCommitSelected={this.onCommitSelected}
          onScroll={this.onScroll}
        />
      </div>
    )
  }

  private renderTabBar() {
    return <div />
  }

  private renderBranchList() {
    return <div />
  }

  private onCommitSelected = (commit: Commit) => {}

  private onScroll = (start: number, end: number) => {}
}
