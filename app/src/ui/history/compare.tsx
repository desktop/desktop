import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import {
  CompareViewMode,
  ICompareState,
  CompareActionType,
  ICompareBranch,
} from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { ThrottledScheduler } from '../lib/throttled-scheduler'
import { Button } from '../lib/button'
import { BranchList } from '../branches'
import { TextBox } from '../lib/text-box'
import { IBranchListItem } from '../branches/group-branches'
import { TabBar } from '../tab-bar'
import { CompareBranchListItem } from './compare-branch-list-item'
import { FancyTextBox } from '../lib/fancy-text-box'
import { OcticonSymbol } from '../octicons'
import { SelectionSource } from '../lib/filter-list'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly compareState: ICompareState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
}

interface ICompareSidebarState {
  /**
   * This branch should only be used when tracking interactions that the user is performing.
   *
   * For all other cases, use the prop
   */
  readonly focusedBranch: Branch | null
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
      focusedBranch: null,
      filterText: '',
      showBranchList: false,
      selectedCommit: null,
    }
  }

  public componentWillMount() {
    this.props.dispatcher.initializeCompareState(this.props.repository)
  }

  public componentWillUnmount() {
    this.textbox = null
  }

  public componentDidMount() {
    if (this.textbox !== null && this.state.showBranchList) {
      this.textbox.focus()
    }
  }

  public render() {
    const formState = this.props.compareState.formState

    const placeholderText =
      formState.kind === CompareViewMode.None
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
        {this.state.showBranchList
          ? this.renderFilterList()
          : this.renderCommits()}
      </div>
    )
  }

  private renderCommits() {
    const formState = this.props.compareState.formState
    return (
      <div className="the-commits">
        {formState.kind === CompareViewMode.None
          ? this.renderCommitList()
          : this.renderTabBar(formState)}
      </div>
    )
  }

  private viewHistoryForBranch = () => {
    this.props.dispatcher.updateCompareState(this.props.repository, {
      kind: CompareActionType.ViewHistory,
    })
  }

  private renderCommitList() {
    const compareState = this.props.compareState
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
    const formState = this.props.compareState.formState
    return (
      <div className="the-commits">
        {this.renderCommitList()}
        {formState.kind === CompareViewMode.Behind
          ? this.renderMergeCallToAction(formState)
          : null}
      </div>
    )
  }

  private renderFilterList() {
    const compareState = this.props.compareState
    return (
      <BranchList
        defaultBranch={compareState.defaultBranch}
        currentBranch={this.props.currentBranch}
        allBranches={compareState.allBranches}
        recentBranches={compareState.recentBranches}
        filterText={this.state.filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.focusedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        renderBranch={this.renderCompareBranchListItem}
      />
    )
  }

  private renderMergeCallToAction(formState: ICompareBranch) {
    const branch = formState.comparisonBranch
    const count = formState.behind
    const pluralized = count > 1 ? 'commits' : 'commit'
    return (
      <div className="merge-cta">
        <Button
          type="submit"
          disabled={count <= 0}
          onClick={this.onMergeClicked}
        >
          Merge into {branch.name}
        </Button>
        <div className="merge-message">
          {`This will merge ${count} ${pluralized}`} from{' '}
          <strong>{branch.name}</strong>
        </div>
      </div>
    )
  }

  private onTabClicked = (index: number) => {
    const formState = this.props.compareState.formState

    if (formState.kind === CompareViewMode.None) {
      // the tab control should never be shown in this case
      // TODO: can we enforce this with TYPES?
      return
    }

    const mode = index === 0 ? CompareViewMode.Behind : CompareViewMode.Ahead
    const branch = formState.comparisonBranch

    this.props.dispatcher.updateCompareState(this.props.repository, {
      kind: CompareActionType.CompareToBranch,
      branch,
      mode,
    })
  }

  private renderTabBar(formState: ICompareBranch) {
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
    const currentBranchName =
      this.props.currentBranch != null ? this.props.currentBranch.name : null
    const branch = item.branch

    const aheadBehind = this.props.compareState.aheadBehindCache.get(
      branch.tip.sha
    )

    return (
      <CompareBranchListItem
        branch={branch}
        isCurrentBranch={branch.name === currentBranchName}
        matches={matches}
        aheadBehind={aheadBehind}
      />
    )
  }

  private onBranchFilterKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>
  ) => {
    const key = event.key

    if (key === 'Enter') {
      if (this.state.filterText.length === 0) {
        this.handleEscape()
      } else {
        if (this.state.focusedBranch == null) {
          this.viewHistoryForBranch()
        } else {
          const branch = this.state.focusedBranch

          this.props.dispatcher.updateCompareState(this.props.repository, {
            kind: CompareActionType.CompareToBranch,
            branch,
            mode: CompareViewMode.Behind,
          })

          this.setState({ filterText: branch.name })
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
    const compareState = this.props.compareState
    const formState = compareState.formState

    if (formState.kind !== CompareViewMode.None) {
      // TODO: we're not loading in more history because we're comparing
      // our branch to some other branch, and should have everything loaded
      return
    }

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }

  private onMergeClicked = async (event: React.MouseEvent<any>) => {
    const formState = this.props.compareState.formState

    if (formState.kind === CompareViewMode.None) {
      // we have not selected a branch, thus the form should never be shown
      // TODO: can we enforce this with T Y P E S?
      return
    }

    await this.props.dispatcher.mergeBranch(
      this.props.repository,
      formState.comparisonBranch.name
    )

    await this.viewHistoryForBranch()
    this.setState({ filterText: '' })
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ filterText: text })
  }

  private clearFilterState = () => {
    this.setState({
      focusedBranch: null,
      filterText: '',
    })

    this.viewHistoryForBranch()
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
      this.setState({
        focusedBranch: branch,
      })
      return
    }

    if (source.kind === 'mouseclick') {
      this.props.dispatcher.updateCompareState(this.props.repository, {
        kind: CompareActionType.CompareToBranch,
        branch,
        mode: CompareViewMode.Behind,
      })

      this.setState({
        filterText: branch.name,
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
