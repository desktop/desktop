import * as React from 'react'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Commit } from '../../models/commit'
import { Dispatcher } from '../../lib/dispatcher'
import { IGitHubUser } from '../../lib/databases'
import { ICompareState, CompareMode } from '../../lib/app-state'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { TabBar } from '../tab-bar'
import { Branch } from '../../models/branch'
import { Select } from '../lib/select'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly compare: ICompareState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly branches: ReadonlyArray<Branch>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

/** The Sidebar component. Contains the branch list, the commit list, and the ability to filter commits. */
export class CompareSidebar extends React.Component<ICompareSidebarProps, {}> {
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  public constructor() {
    super()
  }

  private onCommitChanged = (commit: Commit) => {
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

  public componentWillMount() {
    this.props.dispatcher.loadCompareState(
      this.props.repository,
      null,
      CompareMode.Default
    )
  }

  public componentWillUnmount() {
    this.loadChangedFilesScheduler.clear()
  }

  private onBranchChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const name = event.currentTarget.value
    const index = parseInt(name, 10)

    if (isNaN(index)) {
      log.debug(`oops, we don't have a number?!??!?!`)
      return
    }

    if (index === -1) {
      // 'None' is selected, just show history
      this.props.dispatcher.loadCompareState(
        this.props.repository,
        null,
        CompareMode.Default
      )
    } else {
      const branch = this.props.branches[index]
      if (branch == null) {
        log.debug(`oops, can't find branch: '${name}'`)
      }

      this.props.dispatcher.loadCompareState(
        this.props.repository,
        branch,
        CompareMode.Behind
      )
    }
  }

  private onTabClicked = (index: number) => {
    const mode: CompareMode =
      index === 0 ? CompareMode.Behind : CompareMode.Ahead

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      this.props.compare.branch,
      mode
    )
  }

  private renderBranchList(): JSX.Element {
    const options = new Array<JSX.Element>()
    options.push(
      <option value={-1} key={-1}>
        None
      </option>
    )

    let selectedIndex = -1
    for (const [index, branch] of this.props.branches.entries()) {
      if (
        this.props.compare.branch &&
        this.props.compare.branch.name === branch.name
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
      <Select value={selectedIndex.toString()} onChange={this.onBranchChange}>
        {options}
      </Select>
    )
  }

  private renderTabBar(): JSX.Element | null {
    const compare = this.props.compare
    if (compare.mode === CompareMode.Default) {
      return null
    }

    const selectedTab = compare.mode === CompareMode.Ahead ? 0 : 1

    return (
      <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
        <span>Behind ({compare.behindCount})</span>
        <span>Ahead ({compare.aheadCount})</span>
      </TabBar>
    )
  }
  public render() {
    const compare = this.props.compare
    return (
      <div id="compare-view">
        {this.renderBranchList()}
        {this.renderTabBar()}

        <CommitList
          repository={this.props.repository}
          commitLookup={this.props.commitLookup}
          list={compare.commits}
          selectedSHA={compare.selection.sha}
          onCommitChanged={this.onCommitChanged}
          gitHubUsers={this.props.gitHubUsers}
          emoji={this.props.emoji}
          localCommitSHAs={this.props.localCommitSHAs}
          onRevertCommit={this.props.onRevertCommit}
          onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
          noCommitsMessage={'No commits'}
        />
      </div>
    )
  }
}
