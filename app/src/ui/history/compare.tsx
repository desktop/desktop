import * as React from 'react'
import { CSSTransitionGroup } from 'react-transition-group'

import { IGitHubUser } from '../../lib/databases'
import { Commit } from '../../models/commit'
import {
  HistoryTabMode,
  ICompareState,
  ICompareBranch,
  ComparisonMode,
  IDisplayHistory,
} from '../../lib/app-state'
import { CommitList } from './commit-list'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
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
import { MergeCallToActionWithConflicts } from './merge-call-to-action-with-conflicts'
import { assertNever } from '../../lib/fatal-error'
import { enableNDDBBanner } from '../../lib/feature-flag'

interface ICompareSidebarProps {
  readonly repository: Repository
  readonly isLocalRepository: boolean
  readonly compareState: ICompareState
  readonly gitHubUsers: Map<string, IGitHubUser>
  readonly emoji: Map<string, string>
  readonly commitLookup: Map<string, Commit>
  readonly localCommitSHAs: ReadonlyArray<string>
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch | null
  readonly selectedCommitSha: string | null
  readonly onRevertCommit: (commit: Commit) => void
  readonly onViewCommitOnGitHub: (sha: string) => void
  readonly onCompareListScrolled: (scrollTop: number) => void
  readonly compareListScrollTop?: number
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

  public componentDidMount() {
    this.props.dispatcher.setDivergingBranchNudgeVisibility(
      this.props.repository,
      false
    )
  }

  public componentWillReceiveProps(nextProps: ICompareSidebarProps) {
    const newFormState = nextProps.compareState.formState
    const oldFormState = this.props.compareState.formState

    if (
      newFormState.kind !== oldFormState.kind &&
      newFormState.kind === HistoryTabMode.History
    ) {
      this.setState({
        focusedBranch: null,
      })
      return
    }

    if (
      newFormState.kind !== HistoryTabMode.History &&
      oldFormState.kind !== HistoryTabMode.History
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

  public componentDidUpdate(prevProps: ICompareSidebarProps) {
    const { showBranchList } = this.props.compareState

    if (this.textbox !== null) {
      if (showBranchList) {
        this.textbox.focus()
      } else if (!showBranchList) {
        this.textbox.blur()
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
        {enableNDDBBanner() && (
          <CSSTransitionGroup
            transitionName="diverge-banner"
            transitionAppear={true}
            transitionAppearTimeout={DivergingBannerAnimationTimeout}
            transitionEnterTimeout={DivergingBannerAnimationTimeout}
            transitionLeaveTimeout={DivergingBannerAnimationTimeout}
          >
            {this.renderNotificationBanner()}
          </CSSTransitionGroup>
        )}

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
    const bannerState = this.props.compareState.divergingBranchBannerState

    if (!bannerState.isPromptVisible || bannerState.isPromptDismissed) {
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
        {formState.kind === HistoryTabMode.History
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
      kind: HistoryTabMode.History,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
    })
  }

  private renderCommitList() {
    const { formState, commitSHAs } = this.props.compareState

    let emptyListMessage: string | JSX.Element
    if (formState.kind === HistoryTabMode.History) {
      emptyListMessage = 'No history'
    } else {
      const currentlyComparedBranchName = formState.comparisonBranch.name

      emptyListMessage =
        formState.comparisonMode === ComparisonMode.Ahead ? (
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
        isLocalRepository={this.props.isLocalRepository}
        commitLookup={this.props.commitLookup}
        commitSHAs={commitSHAs}
        selectedSHA={this.props.selectedCommitSha}
        gitHubUsers={this.props.gitHubUsers}
        localCommitSHAs={this.props.localCommitSHAs}
        emoji={this.props.emoji}
        onViewCommitOnGitHub={this.props.onViewCommitOnGitHub}
        onRevertCommit={
          ableToRevertCommit(this.props.compareState.formState)
            ? this.props.onRevertCommit
            : undefined
        }
        onCommitSelected={this.onCommitSelected}
        onScroll={this.onScroll}
        onCreateTag={this.onCreateTag}
        emptyListMessage={emptyListMessage}
        onCompareListScrolled={this.props.onCompareListScrolled}
        compareListScrollTop={this.props.compareListScrollTop}
      />
    )
  }

  private renderActiveTab(view: ICompareBranch) {
    return (
      <div className="compare-commit-list">
        {this.renderCommitList()}
        {view.comparisonMode === ComparisonMode.Behind
          ? this.renderMergeCallToAction(view)
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
      <MergeCallToActionWithConflicts
        repository={this.props.repository}
        dispatcher={this.props.dispatcher}
        mergeStatus={this.props.compareState.mergeStatus}
        currentBranch={this.props.currentBranch}
        comparisonBranch={formState.comparisonBranch}
        commitsBehind={formState.aheadBehind.behind}
        onMerged={this.onMerge}
      />
    )
  }

  private onTabClicked = (index: number) => {
    const formState = this.props.compareState.formState

    if (formState.kind === HistoryTabMode.History) {
      return
    }

    const comparisonMode =
      index === 0 ? ComparisonMode.Behind : ComparisonMode.Ahead
    const branch = formState.comparisonBranch

    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: HistoryTabMode.Compare,
      branch,
      comparisonMode,
    })
  }

  private renderTabBar(formState: ICompareBranch) {
    const selectedTab =
      formState.comparisonMode === ComparisonMode.Behind ? 0 : 1

    return (
      <div className="compare-content">
        <TabBar selectedIndex={selectedTab} onTabClicked={this.onTabClicked}>
          <span>{`Behind (${formState.aheadBehind.behind})`}</span>
          <span>{`Ahead (${formState.aheadBehind.ahead})`}</span>
        </TabBar>
        {this.renderActiveTab(formState)}
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
      const branch = this.state.focusedBranch

      if (branch === null) {
        this.viewHistoryForBranch()
      } else {
        this.props.dispatcher.executeCompare(this.props.repository, {
          kind: HistoryTabMode.Compare,
          comparisonMode: ComparisonMode.Behind,
          branch,
        })

        this.props.dispatcher.updateCompareForm(this.props.repository, {
          filterText: branch.name,
        })
      }

      if (this.textbox) {
        this.textbox.blur()
      }
    } else if (key === 'Escape') {
      this.handleEscape()
    } else if (key === 'ArrowDown') {
      if (this.branchList !== null) {
        this.branchList.selectNextItem(true, 'down')
      }
    } else if (key === 'ArrowUp') {
      if (this.branchList !== null) {
        this.branchList.selectNextItem(true, 'up')
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

    if (formState.kind === HistoryTabMode.Compare) {
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
      kind: HistoryTabMode.Compare,
      comparisonMode: ComparisonMode.Behind,
      branch,
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
        kind: HistoryTabMode.Compare,
        comparisonMode: ComparisonMode.Behind,
        branch,
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
    if (reason === DismissalReason.Close) {
      this.props.dispatcher.dismissDivergingBranchBanner(this.props.repository)
    }
    this.props.dispatcher.recordDivergingBranchBannerDismissal()

    switch (reason) {
      case DismissalReason.Close:
        this.setState({ hasConsumedNotification: false })
        break
      case DismissalReason.Compare:
      case DismissalReason.Merge:
        this.setState({ hasConsumedNotification: true })
        break
      default:
        assertNever(reason, 'Unknown reason')
    }
  }

  private onMerge = () => {
    if (this.state.hasConsumedNotification) {
      this.props.dispatcher.recordDivergingBranchBannerInfluencedMerge()
    }
  }

  private onCreateTag = (targetCommitSha: string) => {
    this.props.dispatcher.showCreateTagDialog(
      this.props.repository,
      targetCommitSha
    )
  }
}

function getPlaceholderText(state: ICompareState) {
  const { allBranches, formState } = state

  if (allBranches.length === 0) {
    return __DARWIN__ ? 'No Branches to Compare' : 'No branches to compare'
  } else if (formState.kind === HistoryTabMode.History) {
    return __DARWIN__
      ? 'Select Branch to Compare...'
      : 'Select branch to compare...'
  } else {
    return undefined
  }
}

// determine if the `onRevertCommit` function should be exposed to the CommitList/CommitListItem.
// `onRevertCommit` is only exposed if the form state of the branch compare form is either
// 1: History mode, 2: Comparison Mode with the 'Ahead' list shown.
// When not exposed, the context menu item 'Revert this commit' is disabled.
function ableToRevertCommit(
  formState: IDisplayHistory | ICompareBranch
): boolean {
  return (
    formState.kind === HistoryTabMode.History ||
    formState.comparisonMode === ComparisonMode.Ahead
  )
}
