import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import { CompareType, IRepositoryState } from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { Button } from '../lib/button'
import { BranchList } from '../branches'
import { TextBox } from '../lib/text-box'
import { TipState } from '../../models/tip'
import { IBranchListItem } from '../branches/group-branches'
import { TabBar } from '../tab-bar'
import { CompareBranchListItem } from './compare-branch-list-item'
import { FancyTextBox } from '../lib/fancy-text-box'
import { OcticonSymbol } from '../octicons'

enum SelectedTab {
  Behind,
  Ahead,
}
interface ICompareSidebarProps {
  readonly repository: Repository
  readonly repositoryState: IRepositoryState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

interface ICompareSidebarState {
  readonly selectedBranch: Branch | null
  readonly compareType: CompareType
  readonly filterText: string
  readonly showFilterList: boolean
  readonly selectedTab: number
  readonly selectedCommit: Commit | null
}

/** If we're within this many rows from the bottom, load the next history batch. */
const CloseToBottomThreshold = 10

export class CompareSidebar extends React.Component<
  ICompareSidebarProps,
  ICompareSidebarState
> {
  private textbox: TextBox | null = null
  private readonly loadChangedFilesScheduler = new ThrottledScheduler(200)

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = {
      selectedBranch: null,
      filterText: '',
      showFilterList: false,
      compareType: CompareType.Default,
      selectedTab: SelectedTab.Behind,
      selectedCommit: null,
    }
  }

  public componentWillMount() {
    this.props.dispatcher.loadCompareState(
      this.props.repository,
      this.state.selectedBranch,
      CompareType.Default
    )
  }

  public componentWillUnmount() {
    this.textbox = null
  }

  public componentDidMount() {
    if (this.textbox !== null && this.state.showFilterList) {
      if (this.state.showFilterList) {
        this.textbox.focus()
      }
    }
  }

  public render() {
    const { showFilterList, selectedBranch } = this.state
    const placeholderText =
      selectedBranch === null
        ? __DARWIN__
          ? 'Select Branch To Compare...'
          : 'Select branch to compare...'
        : undefined

    return (
      <div id="compare-view">
        <div className="the-box">
          <FancyTextBox
            symbol={OcticonSymbol.gitBranch}
            placeholder={placeholderText}
            onFocus={this.onTextBoxFocused}
            onBlur={this.onTextBoxBlurred}
            value={this.state.filterText}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onBranchFilterTextChanged}
            onKeyDown={this.onBranchFilterKeyDown}
          />
        </div>
        {showFilterList ? this.renderFilterList() : this.renderCommits()}
      </div>
    )
  }

  private renderCommits() {
    const { selectedBranch } = this.state

    return (
      <div className="the-commits">
        {selectedBranch ? this.renderTabBar() : this.renderCommitList()}
      </div>
    )
  }

  private renderCommitList() {
    const compareState = this.props.repositoryState.compareState
    const selectedCommit = this.state.selectedCommit

    return (
      <CommitList
        gitHubRepository={this.props.repository.gitHubRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={compareState.commitSHAs}
        selectedSHA={selectedCommit !== null ? selectedCommit.sha : null}
        gitHubUsers={this.props.gitHubUsers}
        localCommitSHAs={this.props.localCommitSHAs}
        emoji={this.props.emoji}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        onRevertCommit={this.props.onRevertCommit}
        onCommitSelected={this.onCommitSelected}
        onScroll={this.onScroll}
      />
    )
  }

  private renderActiveTab() {
    if (this.state.selectedTab === SelectedTab.Behind) {
      return (
        <div className="the-commits">
          {this.renderCommitList()}
          {this.renderMergeCTA()}
        </div>
      )
    } else {
      return <div className="the-commits">{this.renderCommitList()}</div>
    }
  }

  private renderFilterList() {
    const {
      branches,
      recentBranches,
      defaultBranch,
      currentBranch,
    } = this.branchState

    return (
      <BranchList
        defaultBranch={defaultBranch}
        currentBranch={currentBranch}
        allBranches={branches}
        recentBranches={recentBranches}
        filterText={this.state.filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.selectedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        renderBranchListItem={this.renderCompareBranchListItem}
      />
    )
  }

  private renderMergeCTAMessage() {
    const count = this.props.repositoryState.compareState.behind

    if (count === 0) {
      return null
    }

    const pluralized = count > 1 ? 'commits' : 'commit'

    return (
      <div className="merge-message">
        {`This will merge ${count} ${pluralized}`} from{' '}
        <strong>{this.state.selectedBranch!.name}</strong>
      </div>
    )
  }

  private renderMergeCTA() {
    const { compareState, branchesState } = this.props.repositoryState
    const tip = branchesState.tip
    const branch = tip.kind === TipState.Valid ? tip.branch : null

    if (branch === null) {
      return null
    }

    const isDisabled = compareState.behind <= 0

    return (
      <div className="merge-cta">
        <Button
          type="submit"
          disabled={isDisabled}
          onClick={this.onMergeClicked}
        >
          Merge into {branch!.name}
        </Button>
        {this.renderMergeCTAMessage()}
      </div>
    )
  }

  private onTabClicked = (index: number) => {
    const compareType =
      (index as SelectedTab) === SelectedTab.Behind
        ? CompareType.Behind
        : CompareType.Ahead

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      this.state.selectedBranch,
      compareType
    )

    this.setState({ selectedTab: index })
  }

  private renderTabBar() {
    const compareState = this.props.repositoryState.compareState

    return (
      <div className="compare-content">
        <TabBar
          selectedIndex={this.state.selectedTab}
          onTabClicked={this.onTabClicked}
        >
          <span>{`Behind (${compareState.behind})`}</span>
          <span>{`Ahead (${compareState.ahead})`}</span>
        </TabBar>
        {this.renderActiveTab()}
      </div>
    )
  }

  private renderCompareBranchListItem = (
    item: IBranchListItem,
    matches: ReadonlyArray<number>
  ) => {
    const tip = this.props.repositoryState.branchesState.tip
    const currentBranchName =
      tip.kind === TipState.Valid ? tip.branch.name : null
    const branch = item.branch

    return (
      <CompareBranchListItem
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        branch={branch}
        isCurrentBranch={branch.name === currentBranchName}
        matches={matches}
      />
    )
  }

  private get branchState() {
    const branchesState = this.props.repositoryState.branchesState
    const tip = branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null
    const branches = currentBranch
      ? branchesState.allBranches.filter(b => b.name !== currentBranch.name)
      : branchesState.allBranches
    const recentBranches = currentBranch
      ? branchesState.recentBranches.filter(b => b.name !== currentBranch.name)
      : branchesState.recentBranches

    return {
      currentBranch,
      branches,
      recentBranches,
      defaultBranch: branchesState.defaultBranch,
    }
  }

  private onBranchFilterKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    const key = event.key

    if (key === 'Enter') {
      if (this.state.filterText === '') {
        this.handleEscape()
      } else {
        const branch =
          this.props.repositoryState.branchesState.allBranches.find(
            branch =>
              branch.name.toLowerCase() === this.state.filterText.toLowerCase()
          ) || null
        this.props.dispatcher.loadCompareState(
          this.props.repository,
          branch,
          CompareType.Default
        )
        this.setState({ selectedBranch: branch })
        this.textbox!.blur()
      }
    } else if (key === 'Escape') {
      this.handleEscape()
    }
  }

  private handleEscape() {
    this.props.dispatcher.loadCompareState(
      this.props.repository,
      null,
      CompareType.Default
    )
    this.setState({ selectedBranch: null, filterText: '' })
    this.textbox!.blur()
  }

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

    this.setState({ selectedCommit: commit })
  }

  private onScroll = (start: number, end: number) => {
    const commits = this.props.repositoryState.compareState.commitSHAs

    if (commits.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }

  private onMergeClicked = (event: React.MouseEvent<any>) => {
    const branch = this.state.selectedBranch

    if (branch !== null) {
      this.props.dispatcher.mergeBranch(this.props.repository, branch.name)
    }
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private onSelectionChanged = (branch: Branch | null) => {
    const { branches } = this.branchState
    const compareType =
      this.state.compareType === CompareType.Default
        ? CompareType.Behind
        : CompareType.Ahead

    let selectedBranch: Branch | null = this.state.selectedBranch
    if (branch !== null) {
      const b = branches.find(b => b.name === branch.name) || null
      if (b) {
        selectedBranch = b
      }
    }

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      selectedBranch,
      compareType
    )

    this.setState({
      selectedBranch,
      filterText: selectedBranch !== null ? selectedBranch.name : '',
    })
  }

  private onTextBoxFocused = () => {
    this.setState({ showFilterList: true })
  }

  private onTextBoxBlurred = () => {
    this.setState({ showFilterList: false })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }
}
