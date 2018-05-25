import * as React from 'react'
import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import {
  ComparisonView,
  ICompareState,
  CompareActionKind,
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
import { Ref } from '../lib/ref'
import { NotificationBanner } from '../notification-banner';

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly compareState: ICompareState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly sidebarHasFocusWithin: boolean

  /**
   * A flag from the application to indicate the branches list should be expanded.
   */
  readonly shouldShowBranchesList: boolean
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
  private branchList: BranchList | null = null

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = {
      focusedBranch: null,
      filterText: '',
      showBranchList: props.shouldShowBranchesList,
      selectedCommit: null,
    }
  }

  public componentWillReceiveProps(nextProps: ICompareSidebarProps) {
    const newFormState = nextProps.compareState.formState
    const oldFormState = this.props.compareState.formState

    if (
      newFormState.kind !== oldFormState.kind &&
      newFormState.kind === ComparisonView.None
    ) {
      // reset form to it's default state
      this.setState(
        {
          filterText: '',
          focusedBranch: null,
          showBranchList: nextProps.shouldShowBranchesList,
        },
        () => {
          // ensure filter text behaviour matches the prop value
          if (this.textbox !== null) {
            if (nextProps.shouldShowBranchesList) {
              this.textbox.focus()
            } else {
              this.textbox.blur()
            }
          }
        }
      )
      return
    }

    if (
      newFormState.kind !== ComparisonView.None &&
      oldFormState.kind !== ComparisonView.None
    ) {
      const oldBranch = oldFormState.comparisonBranch
      const newBranch = newFormState.comparisonBranch

      if (oldBranch.name !== newBranch.name) {
        // ensure the filter text is in sync with the comparison branch
        this.setState({
          filterText: newBranch.name,
          focusedBranch: newBranch,
        })
      }
    }

    if (
      this.props.shouldShowBranchesList !== nextProps.shouldShowBranchesList
    ) {
      if (nextProps.shouldShowBranchesList === true) {
        this.setState({ showBranchList: true })
      }
    }

    if (nextProps.sidebarHasFocusWithin !== this.props.sidebarHasFocusWithin) {
      if (nextProps.sidebarHasFocusWithin === false) {
        this.setState({ showBranchList: false })
      }
    }
  }

  public componentWillMount() {
    this.props.dispatcher.initializeCompare(this.props.repository)
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
    const { allBranches } = this.props.compareState
    const placeholderText = getPlaceholderText(this.props.compareState)

    return (
      <div id="compare-view">
        <NotificationBanner />

        <div className="compare-form">
          <FancyTextBox
            symbol={OcticonSymbol.gitBranch}
            type="search"
            placeholder={placeholderText}
            onFocus={this.onTextBoxFocused}
            value={this.state.filterText}
            disabled={allBranches.length <= 1}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onBranchFilterTextChanged}
            onKeyDown={this.onBranchFilterKeyDown}
            onSearchCleared={this.onSearchCleared}
          />
        </div>

        {this.state.showBranchList
          ? this.renderFilterList()
          : this.renderCommits()}
      </div>
    )
  }

  private onSearchCleared = () => {
    this.handleEscape()
  }

  private onBranchesListRef = (branchList: BranchList | null) => {
    this.branchList = branchList
  }

  private renderCommits() {
    const formState = this.props.compareState.formState
    return (
      <div className="compare-commit-list">
        {formState.kind === ComparisonView.None
          ? this.renderCommitList()
          : this.renderTabBar(formState)}
      </div>
    )
  }

  private viewHistoryForBranch = () => {
    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: CompareActionKind.History,
    })
  }

  private renderCommitList() {
    const compareState = this.props.compareState
    const selectedCommit = this.state.selectedCommit
    const commitSHAs = compareState.commitSHAs

    let emptyListMessage: string | JSX.Element
    if (compareState.formState.kind === ComparisonView.None) {
      emptyListMessage = 'No history'
    } else {
      const currentlyComparedBranchName =
        compareState.formState.comparisonBranch.name

      emptyListMessage =
        compareState.formState.kind === ComparisonView.Ahead ? (
          <p>
            The compared branch (<Ref>{currentlyComparedBranchName}</Ref>) is up
            to date with your branch
          </p>
        ) : (
          <p>
            Your branch is up to date with the compared branch (<Ref>
              {currentlyComparedBranchName}
            </Ref>)
          </p>
        )
    }

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
        emptyListMessage={emptyListMessage}
      />
    )
  }

  private renderActiveTab() {
    const formState = this.props.compareState.formState
    return (
      <div className="compare-commit-list">
        {this.renderCommitList()}
        {formState.kind === ComparisonView.Behind
          ? this.renderMergeCallToAction(formState)
          : null}
      </div>
    )
  }

  private renderFilterList() {
    const compareState = this.props.compareState
    return (
      <BranchList
        ref={this.onBranchesListRef}
        defaultBranch={compareState.defaultBranch}
        currentBranch={this.props.currentBranch}
        allBranches={compareState.allBranches}
        recentBranches={compareState.recentBranches}
        filterText={this.state.filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.focusedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onItemClick={this.onBranchItemClicked}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        renderBranch={this.renderCompareBranchListItem}
      />
    )
  }

  private renderMergeCallToAction(formState: ICompareBranch) {
    if (this.props.currentBranch == null) {
      return null
    }

    const count = formState.aheadBehind.behind

    return (
      <div className="merge-cta">
        <Button
          type="submit"
          disabled={count <= 0}
          onClick={this.onMergeClicked}
        >
          Merge into <strong>{this.props.currentBranch.name}</strong>
        </Button>

        {this.renderMergeDetails(formState, this.props.currentBranch)}
      </div>
    )
  }

  private renderMergeDetails(formState: ICompareBranch, currentBranch: Branch) {
    const branch = formState.comparisonBranch
    const count = formState.aheadBehind.behind

    if (count > 0) {
      const pluralized = count === 1 ? 'commit' : 'commits'
      return (
        <div className="merge-message">
          This will merge
          <strong>{` ${count} ${pluralized}`}</strong>
          {` `}from{` `}
          <strong>{branch.name}</strong>
          {` `}into{` `}
          <strong>{currentBranch.name}</strong>
        </div>
      )
    }

    return null
  }

  private onTabClicked = (index: number) => {
    const formState = this.props.compareState.formState

    if (formState.kind === ComparisonView.None) {
      return
    }

    const mode = index === 0 ? ComparisonView.Behind : ComparisonView.Ahead
    const branch = formState.comparisonBranch

    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: CompareActionKind.Branch,
      branch,
      mode,
    })
  }

  private renderTabBar(formState: ICompareBranch) {
    const selectedTab = formState.kind === ComparisonView.Behind ? 0 : 1

    return (
      <div className="compare-content">
        <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
          <span>{`Behind (${formState.aheadBehind.behind})`}</span>
          <span>{`Ahead (${formState.aheadBehind.ahead})`}</span>
        </TabBar>
        {this.renderActiveTab()}
      </div>
    )
  }

  private renderCompareBranchListItem = (
    item: IBranchListItem,
    matches: ReadonlyArray<number>
  ) => {
    const currentBranch = this.props.currentBranch

    const currentBranchName = currentBranch != null ? currentBranch.name : null
    const branch = item.branch

    const aheadBehind = currentBranch
      ? this.props.compareState.aheadBehindCache.get(
          currentBranch.tip.sha,
          branch.tip.sha
        )
      : null

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

          this.props.dispatcher.executeCompare(this.props.repository, {
            kind: CompareActionKind.Branch,
            branch,
            mode: ComparisonView.Behind,
          })

          this.setState({ filterText: branch.name })
        }

        if (this.textbox) {
          this.textbox.blur()
        }
      }
    } else if (key === 'Escape') {
      this.handleEscape()
    } else if (key === 'ArrowDown') {
      if (this.branchList !== null) {
        this.branchList.selectFirstItem(true)
      }
    }
  }

  private handleEscape() {
    this.clearFilterState()
    if (this.textbox) {
      this.textbox.blur()
    }
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

    if (formState.kind !== ComparisonView.None) {
      // as the app is currently comparing the current branch to some other
      // branch, everything needed should be loaded
      return
    }

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      this.props.dispatcher.loadNextHistoryBatch(this.props.repository)
    }
  }

  private onMergeClicked = async (event: React.MouseEvent<any>) => {
    const formState = this.props.compareState.formState

    if (formState.kind === ComparisonView.None) {
      return
    }

    this.props.dispatcher.recordCompareInitiatedMerge()
    await this.props.dispatcher.mergeBranch(
      this.props.repository,
      formState.comparisonBranch.name
    )

    await this.viewHistoryForBranch()
    this.setState({ filterText: '' })
  }

  private onBranchFilterTextChanged = (filterText: string) => {
    if (filterText.length === 0) {
      this.setState({ focusedBranch: null, filterText })
      if (this.props.compareState.formState.kind !== ComparisonView.None) {
        // ensure any previous filter branch selection is cleared
        this.props.dispatcher.executeCompare(this.props.repository, {
          kind: CompareActionKind.History,
        })
      }
    } else {
      this.setState({ filterText })
    }
  }

  private clearFilterState = () => {
    this.setState({
      focusedBranch: null,
      filterText: '',
    })

    this.viewHistoryForBranch()
  }

  private onBranchItemClicked = (branch: Branch) => {
    this.props.dispatcher.executeCompare(this.props.repository, {
      branch,
      kind: CompareActionKind.Branch,
      mode: ComparisonView.Behind,
    })

    this.setState({
      filterText: branch.name,
      focusedBranch: null,
      showBranchList: false,
    })
  }

  private onSelectionChanged = (
    branch: Branch | null,
    source: SelectionSource
  ) => {
    if (source.kind === 'mouseclick' && branch != null) {
      this.props.dispatcher.executeCompare(this.props.repository, {
        branch,
        kind: CompareActionKind.Branch,
        mode: ComparisonView.Behind,
      })
    }

    this.setState({
      focusedBranch: branch,
    })
  }

  private onTextBoxFocused = () => {
    this.setState({ showBranchList: true })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }
}

function getPlaceholderText(state: ICompareState) {
  const { allBranches, formState } = state

  if (allBranches.length <= 1) {
    return __DARWIN__ ? 'No Branches to Compare' : 'No branches to compare'
  } else if (formState.kind === ComparisonView.None) {
    return __DARWIN__
      ? 'Select Branch to Compare...'
      : 'Select branch to compare...'
  } else {
    return undefined
  }
}
