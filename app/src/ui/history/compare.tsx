import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import { ICompareState, CompareType } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { TabBar } from '../tab-bar'
import { Branch } from '../../models/branch'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly state: ICompareState
  readonly branches: ReadonlyArray<Branch>
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
          commitSHAs={this.props.state.commitSHAs}
          selectedSHA={this.props.state.selection.sha}
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
    const compare = this.props.state
    const compareType = compare.compareType

    if (compareType === CompareType.Default) {
      return null
    }

    const selectedTab = compareType === CompareType.Ahead ? 0 : 1

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
        <span>Behind ({compare.behind})</span>
        <span>Ahead ({compare.ahead})</span>
      </TabBar>
    )
  }

  private renderBranchList() {
    const options = new Array<JSX.Element>()
    options.push(
      <option value={-1} key={-1}>
        None
      </option>
    )

    let selectedIndex = -1
    for (const [index, branch] of this.props.branches.entries()) {
      if (
        this.props.state.branch &&
        this.props.state.branch.name === branch.name
      ) {
        selectedIndex = index
      }

      options.push(
        <option value={index} key={branch.name}>
          {branch.name}
        </option>
      )
    }

    return (
      <select value={selectedIndex.toString()} onChange={this.onBranchChanged}>
        {options}
      </select>
    )
  }

  private onBranchChanged = (event: React.FormEvent<HTMLSelectElement>) => {}

  private onCommitSelected = (commit: Commit) => {}

  private onScroll = (start: number, end: number) => {}

  private onTabClicked = (tabIndex: number) => {}
}
