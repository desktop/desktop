import * as React from 'react'
import { CSSTransitionGroup } from 'react-transition-group'

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
import { BranchList } from '../branches'
import { TextBox } from '../lib/text-box'
import { IBranchListItem } from '../branches/group-branches'
import { TabBar } from '../tab-bar'
import { CompareBranchListItem } from './compare-branch-list-item'
import { FancyTextBox } from '../lib/fancy-text-box'
import { OcticonSymbol } from '../octicons'
import { SelectionSource } from '../lib/filter-list'
import { IMatches } from '../../lib/fuzzy-find'
import { Ref } from '../lib/ref'
import {
  NewCommitsBanner,
  DismissalReason,
} from '../notification/new-commits-banner'
import { enableNotificationOfBranchUpdates } from '../../lib/feature-flag'
import { MergeCallToAction } from './merge-call-to-action'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly compareState: ICompareState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly selectedCommitSha: string | null
  readonly isDivergingBranchBannerVisible: boolean
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

  /**
   * Flag that tracks whether the user interacted with one of the notification's
   * "call to action" buttons
   */
  readonly hasConsumedNotification: boolean
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
  private loadingMoreCommitsPromise: Promise<void> | null = null
  private resultCount = 0

  public constructor(props: ICompareSidebarProps) {
    super(props)

    this.state = {
      focusedBranch: null,
      hasConsumedNotification: false,
    }
  }

  public componentWillReceiveProps(nextProps: ICompareSidebarProps) {
    const newFormState = nextProps.compareState.formState
    const oldFormState = this.props.compareState.formState

    if (this.textbox !== null) {
      if (
        !this.props.compareState.showBranchList &&
        nextProps.compareState.showBranchList
      ) {
        // showBranchList changes from false -> true
        //  -> ensure the textbox has focus
        this.textbox.focus()
      } else if (
        this.props.compareState.showBranchList &&
        !nextProps.compareState.showBranchList
      ) {
        // showBranchList changes from true -> false
        //  -> ensure the textbox no longer has focus
        this.textbox.blur()
      }
    }

    if (
      newFormState.kind !== oldFormState.kind &&
      newFormState.kind === ComparisonView.None
    ) {
      this.setState({
        focusedBranch: null,
      })
      return
    }

    if (
      newFormState.kind !== ComparisonView.None &&
      oldFormState.kind !== ComparisonView.None
    ) {
      const oldBranch = oldFormState.comparisonBranch
      const newBranch = newFormState.comparisonBranch

      if (oldBranch.name !== newBranch.name) {
        // ensure the focused branch is in sync with the chosen branch
        this.setState({
          focusedBranch: newBranch,
        })
      }
    }
  }

  public componentWillMount() {
    this.props.dispatcher.initializeCompare(this.props.repository)
  }

  public componentWillUnmount() {
    this.textbox = null

    // by hiding the branch list here when the component is torn down
    // we ensure any ahead/behind computation work is discarded
    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
    })
  }

  public render() {
    const { allBranches, filterText, showBranchList } = this.props.compareState
    const placeholderText = getPlaceholderText(this.props.compareState)
    const DivergingBannerAnimationTimeout = 300

    return (
      <div id="compare-view">
        <CSSTransitionGroup
          transitionName="diverge-banner"
          transitionAppear={true}
          transitionAppearTimeout={DivergingBannerAnimationTimeout}
          transitionEnterTimeout={DivergingBannerAnimationTimeout}
          transitionLeaveTimeout={DivergingBannerAnimationTimeout}
        >
          {this.renderNotificationBanner()}
        </CSSTransitionGroup>

        <div className="compare-form">
          <FancyTextBox
            symbol={OcticonSymbol.gitBranch}
            type="search"
            placeholder={placeholderText}
            onFocus={this.onTextBoxFocused}
            value={filterText}
            disabled={allBranches.length === 0}
            onRef={this.onTextBoxRef}
            onValueChanged={this.onBranchFilterTextChanged}
            onKeyDown={this.onBranchFilterKeyDown}
            onSearchCleared={this.handleEscape}
          />
        </div>

        {showBranchList ? this.renderFilterList() : this.renderCommits()}
      </div>
    )
  }

  private onBranchesListRef = (branchList: BranchList | null) => {
    this.branchList = branchList
  }

  private renderNotificationBanner() {
    if (!enableNotificationOfBranchUpdates()) {
      return null
    }

    if (!this.props.isDivergingBranchBannerVisible) {
      return null
    }

    const { inferredComparisonBranch } = this.props.compareState

    return inferredComparisonBranch.branch !== null &&
      inferredComparisonBranch.aheadBehind !== null &&
      inferredComparisonBranch.aheadBehind.behind > 0 ? (
      <div className="diverge-banner-wrapper">
        <NewCommitsBanner
          dispatcher={this.props.dispatcher}
          repository={this.props.repository}
          commitsBehindBaseBranch={inferredComparisonBranch.aheadBehind.behind}
          baseBranch={inferredComparisonBranch.branch}
          onDismiss={this.onNotificationBannerDismissed}
        />
      </div>
    ) : null
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

  private filterListResultsChanged = (resultCount: number) => {
    this.resultCount = resultCount
  }

  private viewHistoryForBranch = () => {
    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: CompareActionKind.History,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
    })
  }

  private renderCommitList() {
    const { formState, commitSHAs } = this.props.compareState

    let emptyListMessage: string | JSX.Element
    if (formState.kind === ComparisonView.None) {
      emptyListMessage = 'No history'
    } else {
      const currentlyComparedBranchName = formState.comparisonBranch.name

      emptyListMessage =
        formState.kind === ComparisonView.Ahead ? (
          <p>
            The compared branch (<Ref>{currentlyComparedBranchName}</Ref>) is up
            to date with your branch
          </p>
        ) : (
          <p>
            Your branch is up to date with the compared branch (
            <Ref>{currentlyComparedBranchName}</Ref>)
          </p>
        )
    }

    return (
      <CommitList
        gitHubRepository={this.props.repository.gitHubRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={commitSHAs}
        selectedSHA={this.props.selectedCommitSha}
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
    const {
      defaultBranch,
      allBranches,
      recentBranches,
      filterText,
    } = this.props.compareState

    return (
      <BranchList
        ref={this.onBranchesListRef}
        defaultBranch={defaultBranch}
        currentBranch={this.props.currentBranch}
        allBranches={allBranches}
        recentBranches={recentBranches}
        filterText={filterText}
        textbox={this.textbox!}
        selectedBranch={this.state.focusedBranch}
        canCreateNewBranch={false}
        onSelectionChanged={this.onSelectionChanged}
        onItemClick={this.onBranchItemClicked}
        onFilterTextChanged={this.onBranchFilterTextChanged}
        renderBranch={this.renderCompareBranchListItem}
        onFilterListResultsChanged={this.filterListResultsChanged}
      />
    )
  }

  private renderMergeCallToAction(formState: ICompareBranch) {
    if (this.props.currentBranch == null) {
      return null
    }

    return (
      <MergeCallToAction
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        currentBranch={this.props.currentBranch}
        formState={formState}
        onMerged={this.onMerge}
      />
    )
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
    matches: IMatches
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
      if (this.resultCount === 0) {
        event.preventDefault()
        return
      }

      if (this.props.compareState.filterText.length === 0) {
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

          this.props.dispatcher.updateCompareForm(this.props.repository, {
            filterText: branch.name,
          })
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

  private handleEscape = () => {
    this.clearFilterState()
    if (this.textbox) {
      this.textbox.blur()
    }
  }

  private onCommitSelected = (commit: Commit) => {
    this.props.dispatcher.changeCommitSelection(
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
    const compareState = this.props.compareState
    const formState = compareState.formState

    if (formState.kind !== ComparisonView.None) {
      // as the app is currently comparing the current branch to some other
      // branch, everything needed should be loaded
      return
    }

    const commits = compareState.commitSHAs
    if (commits.length - end <= CloseToBottomThreshold) {
      if (this.loadingMoreCommitsPromise != null) {
        // as this callback fires for any scroll event we need to guard
        // against re-entrant calls to loadNextHistoryBatch
        return
      }

      this.loadingMoreCommitsPromise = this.props.dispatcher
        .loadNextCommitBatch(this.props.repository)
        .then(() => {
          // deferring unsetting this flag to some time _after_ the commits
          // have been appended to prevent eagerly adding more commits due
          // to scroll events (which fire indiscriminately)
          window.setTimeout(() => {
            this.loadingMoreCommitsPromise = null
          }, 500)
        })
    }
  }

  private onBranchFilterTextChanged = (filterText: string) => {
    if (filterText.length === 0) {
      this.setState({ focusedBranch: null })
    }

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText,
    })
  }

  private clearFilterState = () => {
    this.setState({
      focusedBranch: null,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
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
      focusedBranch: null,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      filterText: branch.name,
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
    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: true,
    })
  }

  private onTextBoxRef = (textbox: TextBox) => {
    this.textbox = textbox
  }

  private onNotificationBannerDismissed = (reason: DismissalReason) => {
    this.props.dispatcher.setDivergingBranchBannerVisibility(false)
    this.props.dispatcher.recordDivergingBranchBannerDismissal()

    switch (reason) {
      case 'close':
        this.setState({ hasConsumedNotification: false })
        break
      case 'compare':
      case 'merge':
        this.setState({ hasConsumedNotification: true })
        break
    }
  }

  private onMerge = () => {
    if (this.state.hasConsumedNotification) {
      this.props.dispatcher.recordDivergingBranchBannerInfluencedMerge()
    }
  }
}

function getPlaceholderText(state: ICompareState) {
  const { allBranches, formState } = state

  if (allBranches.length === 0) {
    return __DARWIN__ ? 'No Branches to Compare' : 'No branches to compare'
  } else if (formState.kind === ComparisonView.None) {
    return __DARWIN__
      ? 'Select Branch to Compare...'
      : 'Select branch to compare...'
  } else {
    return undefined
  }
}
