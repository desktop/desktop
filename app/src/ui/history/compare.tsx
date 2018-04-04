import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import {
  CompareViewMode,
  IRepositoryState,
  CompareActionType,
  CompareAction,
} from '../../lib/app-state'
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
import { SelectionSource } from '../lib/filter-list'

const ViewHistory: CompareAction = {
  kind: CompareActionType.ViewHistory,
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
  readonly compareType: CompareViewMode
  readonly filterText: string
  readonly showBranchList: boolean
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
      showBranchList: false,
      compareType: CompareViewMode.None,
      selectedCommit: null,
    }
  }

  public componentWillMount() {
    this.props.dispatcher.loadCompareState(this.props.repository, ViewHistory)
  }

  public componentWillUnmount() {
    this.textbox = null
  }

  public componentDidMount() {
    if (this.textbox !== null && this.state.showBranchList) {
      if (this.state.showBranchList) {
        this.textbox.focus()
      }
    }
  }

  public render() {
    const { showBranchList, selectedBranch } = this.state
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
        {showBranchList ? this.renderFilterList() : this.renderCommits()}
      </div>
    )
  }

  private renderCommits() {
    const compareState = this.props.repositoryState.compareState

    return (
      <div className="the-commits">
        {compareState.compareFormState.kind === CompareViewMode.None
          ? this.renderCommitList()
          : this.renderTabBar()}
      </div>
    )
  }

  private renderCommitList() {
    const compareState = this.props.repositoryState.compareState
    const selectedCommit = this.state.selectedCommit
    const commitSHAs = compareState.commitSHAs

    return (
      <CommitList
        gitHubRepository={this.props.repository.gitHubRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={commitSHAs}
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
    const formState = this.props.repositoryState.compareState.compareFormState
    if (formState.kind === CompareViewMode.Behind) {
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
        renderBranch={this.renderCompareBranchListItem}
      />
    )
  }

  private renderMergeCTAMessage() {
    const compareState = this.props.repositoryState.compareState
    const formState = compareState.compareFormState
    if (formState.kind === CompareViewMode.None) {
      return null
    }

    // TODO: where are we getting this from?

    const count = formState.behind
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
    const formState = compareState.compareFormState
    if (formState.kind === CompareViewMode.None) {
      return null
    }

    const tip = branchesState.tip
    const branch = tip.kind === TipState.Valid ? tip.branch : null
    if (branch === null) {
      return null
    }

    // TODO: where are we getting this from?

    const isDisabled = formState.behind <= 0

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
    const mode = index === 0 ? CompareViewMode.Behind : CompareViewMode.Ahead

    const compareToBranch: CompareAction = {
      kind: CompareActionType.CompareToBranch,
      branch: this.state.selectedBranch!,
      mode,
    }

    this.props.dispatcher.loadCompareState(
      this.props.repository,
      compareToBranch
    )
  }

  private renderTabBar() {
    const compareState = this.props.repositoryState.compareState
    const formState = compareState.compareFormState

    if (formState.kind === CompareViewMode.None) {
      return null
    }

    const selectedTab = formState.kind === CompareViewMode.Behind ? 0 : 1

    return (
      <div className="compare-content">
        <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
          <span>{`Behind (${formState.behind})`}</span>
          <span>{`Ahead (${formState.ahead})`}</span>
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

    const {
      ahead,
      behind,
    } = this.props.repositoryState.compareState.aheadBehindCache.get(
      branch.tip.sha
    ) || { ahead: 0, behind: 0 }

    return (
      <CompareBranchListItem
        branch={branch}
        isCurrentBranch={branch.name === currentBranchName}
        matches={matches}
        ahead={ahead}
        behind={behind}
      />
    )
  }

  private get branchState() {
    // TODO: move this into compare state

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
      if (this.state.filterText.length === 0) {
        this.handleEscape()
      } else {
        if (this.state.selectedBranch == null) {
          this.props.dispatcher.loadCompareState(
            this.props.repository,
            ViewHistory
          )
        } else {
          this.props.dispatcher.loadCompareState(this.props.repository, {
            kind: CompareActionType.CompareToBranch,
            branch: this.state.selectedBranch,
            mode: CompareViewMode.Behind,
          })

          this.setState({ filterText: this.state.selectedBranch.name })
        }
        this.textbox!.blur()
      }
    } else if (key === 'Escape') {
      this.handleEscape()
    }
  }

  private handleEscape() {
    this.clearFilterState()
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
    const compareState = this.props.repositoryState.compareState
    const formState = compareState.compareFormState

    if (formState.kind === CompareViewMode.None) {
      return
    }

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }

  private onMergeClicked = (event: React.MouseEvent<any>) => {
    const branch = this.state.selectedBranch

    // branch is guaranteed to be not null
    this.props.dispatcher.mergeBranch(this.props.repository, branch!.name)
    this.props.dispatcher.loadCompareState(this.props.repository, ViewHistory)

    this.setState({ selectedBranch: null, filterText: '' })
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private clearFilterState = () => {
    this.setState({
      selectedBranch: null,
      filterText: '',
      compareType: CompareViewMode.None,
    })

    this.props.dispatcher.loadCompareState(this.props.repository, ViewHistory)
  }

  private onSelectionChanged = (
    branch: Branch | null,
    source: SelectionSource
  ) => {
    if (branch === null) {
      this.clearFilterState()
      return
    }

    if (source.kind === 'filter') {
      // don't load the comparison state until a selection has been made
      this.setState({
        selectedBranch: branch,
      })
      return
    }

    if (source.kind === 'mouseclick') {
      const kind = CompareViewMode.Behind

      this.props.dispatcher.loadCompareState(this.props.repository, {
        kind: CompareActionType.CompareToBranch,
        branch,
        mode: CompareViewMode.Behind,
      })

      this.setState({
        selectedBranch: branch,
        filterText: branch.name,
        compareType: kind,
      })
    }
  }

  private onTextBoxFocused = () => {
    this.setState({ showBranchList: true })
  }

  private onTextBoxBlurred = () => {
    this.setState({ showBranchList: false })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }
}
