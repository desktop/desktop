import * as React from 'react'

import { PullRequest } from '../../models/pull-request'
import {
  Repository,
  isRepositoryWithGitHubRepository,
} from '../../models/repository'
import { Branch } from '../../models/branch'
import { BranchesTab } from '../../models/branches-tab'
import { PopupType } from '../../models/popup'

import { Dispatcher } from '../dispatcher'
import { FoldoutType } from '../../lib/app-state'
import { assertNever } from '../../lib/fatal-error'

import { TabBar } from '../tab-bar'

import { Row } from '../lib/row'
import { Octicon } from '../octicons'
import * as octicons from '../octicons/octicons.generated'
import { Button } from '../lib/button'

import { BranchList } from './branch-list'
import { PullRequestList } from './pull-request-list'
import { IBranchListItem } from './group-branches'
import {
  getDefaultAriaLabelForBranch,
  renderDefaultBranch,
} from './branch-renderer'
import { IMatches } from '../../lib/fuzzy-find'
import { startTimer } from '../lib/timing'
import { dragAndDropManager } from '../../lib/drag-and-drop-manager'
import { DragType, DropTargetType } from '../../models/drag-drop'
import {
  enablePullRequestQuickView,
  enableResizingToolbarButtons,
} from '../../lib/feature-flag'
import { PullRequestQuickView } from '../pull-request-quick-view'
import { Emoji } from '../../lib/emoji'
import classNames from 'classnames'

interface IBranchesContainerProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly selectedTab: BranchesTab
  readonly allBranches: ReadonlyArray<Branch>
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly recentBranches: ReadonlyArray<Branch>
  readonly pullRequests: ReadonlyArray<PullRequest>
  readonly onRenameBranch: (branchName: string) => void
  readonly onDeleteBranch: (branchName: string) => void

  /** The pull request associated with the current branch. */
  readonly currentPullRequest: PullRequest | null

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean

  /** Map from the emoji shortcut (e.g., :+1:) to the image's local path. */
  readonly emoji: Map<string, Emoji>

  readonly underlineLinks: boolean
}

interface IBranchesContainerState {
  /**
   * A copy of the last seen currentPullRequest property
   * from props. Used in order to be able to detect when
   * the selected PR in props changes in getDerivedStateFromProps
   */
  readonly currentPullRequest: PullRequest | null
  readonly selectedPullRequest: PullRequest | null
  readonly selectedBranch: Branch | null
  readonly branchFilterText: string
  readonly pullRequestBeingViewed: {
    pr: PullRequest
    prListItemTop: number
  } | null
}

/** The unified Branches and Pull Requests component. */
export class BranchesContainer extends React.Component<
  IBranchesContainerProps,
  IBranchesContainerState
> {
  public static getDerivedStateFromProps(
    props: IBranchesContainerProps,
    state: IBranchesContainerProps
  ): Partial<IBranchesContainerState> | null {
    if (state.currentPullRequest !== props.currentPullRequest) {
      return {
        currentPullRequest: props.currentPullRequest,
        selectedPullRequest: props.currentPullRequest,
      }
    }

    return null
  }

  private pullRequestQuickViewTimerId: number | null = null

  public constructor(props: IBranchesContainerProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
      selectedPullRequest: props.currentPullRequest,
      currentPullRequest: props.currentPullRequest,
      branchFilterText: '',
      pullRequestBeingViewed: null,
    }
  }

  public componentWillUnmount = () => {
    this.clearPullRequestQuickViewTimer()
  }

  public render() {
    const classes = classNames('branches-container', {
      resizable: enableResizingToolbarButtons(),
    })
    return (
      <div className={classes}>
        {this.renderTabBar()}
        {this.renderSelectedTab()}
        {this.renderMergeButtonRow()}
        {this.renderPullRequestQuickView()}
      </div>
    )
  }

  private renderPullRequestQuickView = (): JSX.Element | null => {
    if (
      !enablePullRequestQuickView() ||
      this.state.pullRequestBeingViewed === null
    ) {
      return null
    }

    const { pr, prListItemTop } = this.state.pullRequestBeingViewed

    return (
      <PullRequestQuickView
        dispatcher={this.props.dispatcher}
        emoji={this.props.emoji}
        pullRequest={pr}
        pullRequestItemTop={prListItemTop}
        onMouseEnter={this.onMouseEnterPullRequestQuickView}
        onMouseLeave={this.onMouseLeavePullRequestQuickView}
        underlineLinks={this.props.underlineLinks}
      />
    )
  }

  private onMouseEnterPullRequestQuickView = () => {
    this.clearPullRequestQuickViewTimer()
  }

  private onMouseLeavePullRequestQuickView = () => {
    this.setState({
      pullRequestBeingViewed: null,
    })
    this.clearPullRequestQuickViewTimer()
  }

  private renderMergeButtonRow() {
    const { currentBranch } = this.props

    // This could happen if HEAD is detached, in that
    // case it's better to not render anything at all.
    if (currentBranch === null) {
      return null
    }

    return (
      <Row className="merge-button-row">
        <Button
          className="merge-button"
          onClick={this.onMergeClick}
          tooltip={`Choose a branch to merge into ${currentBranch.name}`}
        >
          <Octicon className="icon" symbol={octicons.gitMerge} />
          Choose a branch to merge into <strong>{currentBranch.name}</strong>
        </Button>
      </Row>
    )
  }

  private renderOpenPullRequestsBubble() {
    const pullRequests = this.props.pullRequests

    if (pullRequests.length > 0) {
      return <span className="count">{pullRequests.length}</span>
    }

    return null
  }

  private renderTabBar() {
    if (!this.props.repository.gitHubRepository) {
      return null
    }

    return (
      <TabBar
        onTabClicked={this.onTabClicked}
        selectedIndex={this.props.selectedTab}
        allowDragOverSwitching={true}
      >
        <span id="branches-tab">Branches</span>
        <span id="pull-requests-tab" className="pull-request-tab">
          {__DARWIN__ ? 'Pull Requests' : 'Pull requests'}
          {this.renderOpenPullRequestsBubble()}
        </span>
      </TabBar>
    )
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(
      item,
      matches,
      this.props.currentBranch,
      this.onDropOntoBranch,
      this.onDropOntoCurrentBranch
    )
  }

  private getBranchAriaLabel = (item: IBranchListItem): string => {
    return getDefaultAriaLabelForBranch(item)
  }

  private renderSelectedTab() {
    const { selectedTab, repository } = this.props

    const ariaLabelledBy =
      selectedTab === BranchesTab.Branches || !repository.gitHubRepository
        ? 'branches-tab'
        : 'pull-requests-tab'

    return (
      <div
        role="tabpanel"
        aria-labelledby={ariaLabelledBy}
        className="branches-container-panel"
      >
        {this.renderSelectedTabContent()}
      </div>
    )
  }

  private renderSelectedTabContent() {
    let tab = this.props.selectedTab

    if (!this.props.repository.gitHubRepository) {
      tab = BranchesTab.Branches
    }

    switch (tab) {
      case BranchesTab.Branches:
        return (
          <BranchList
            defaultBranch={this.props.defaultBranch}
            currentBranch={this.props.currentBranch}
            allBranches={this.props.allBranches}
            recentBranches={this.props.recentBranches}
            onItemClick={this.onBranchItemClick}
            filterText={this.state.branchFilterText}
            onFilterTextChanged={this.onBranchFilterTextChanged}
            selectedBranch={this.state.selectedBranch}
            onSelectionChanged={this.onBranchSelectionChanged}
            canCreateNewBranch={true}
            onCreateNewBranch={this.onCreateBranchWithName}
            renderBranch={this.renderBranch}
            getBranchAriaLabel={this.getBranchAriaLabel}
            hideFilterRow={dragAndDropManager.isDragOfTypeInProgress(
              DragType.Commit
            )}
            renderPreList={this.renderPreList}
            onRenameBranch={this.props.onRenameBranch}
            onDeleteBranch={this.props.onDeleteBranch}
          />
        )
      case BranchesTab.PullRequests: {
        return this.renderPullRequests()
      }
      default:
        return assertNever(tab, `Unknown Branches tab: ${tab}`)
    }
  }

  private renderPreList = () => {
    if (!dragAndDropManager.isDragOfTypeInProgress(DragType.Commit)) {
      return null
    }

    const label = __DARWIN__ ? 'New Branch' : 'New branch'

    return (
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div
        className="branches-list-item new-branch-drop"
        onMouseEnter={this.onMouseEnterNewBranchDrop}
        onMouseLeave={this.onMouseLeaveNewBranchDrop}
        onMouseUp={this.onMouseUpNewBranchDrop}
      >
        <Octicon className="icon" symbol={octicons.plus} />
        <div className="name">{label}</div>
      </div>
    )
  }

  private onMouseUpNewBranchDrop = async () => {
    const { dragData } = dragAndDropManager
    if (dragData === null || dragData.type !== DragType.Commit) {
      return
    }

    const { dispatcher, repository, currentBranch } = this.props

    await dispatcher.setCherryPickCreateBranchFlowStep(
      repository,
      '',
      dragData.commits,
      currentBranch
    )

    this.props.dispatcher.showPopup({
      type: PopupType.MultiCommitOperation,
      repository,
    })
  }

  private onMouseEnterNewBranchDrop = () => {
    // This is just used for displaying on windows drag ghost.
    // Thus, it doesn't have to be an actual branch name.
    dragAndDropManager.emitEnterDropTarget({
      type: DropTargetType.Branch,
      branchName: 'a new branch',
    })
  }

  private onMouseLeaveNewBranchDrop = () => {
    dragAndDropManager.emitLeaveDropTarget()
  }

  private renderPullRequests() {
    const repository = this.props.repository
    if (!isRepositoryWithGitHubRepository(repository)) {
      return null
    }

    const isOnDefaultBranch =
      this.props.defaultBranch &&
      this.props.currentBranch &&
      this.props.defaultBranch.name === this.props.currentBranch.name

    return (
      <PullRequestList
        key="pr-list"
        pullRequests={this.props.pullRequests}
        selectedPullRequest={this.state.selectedPullRequest}
        isOnDefaultBranch={!!isOnDefaultBranch}
        onSelectionChanged={this.onPullRequestSelectionChanged}
        onCreateBranch={this.onCreateBranch}
        dispatcher={this.props.dispatcher}
        repository={repository}
        isLoadingPullRequests={this.props.isLoadingPullRequests}
        onMouseEnterPullRequest={this.onMouseEnterPullRequestListItem}
        onMouseLeavePullRequest={this.onMouseLeavePullRequestListItem}
      />
    )
  }

  private onMouseEnterPullRequestListItem = (
    pr: PullRequest,
    prListItemTop: number
  ) => {
    this.clearPullRequestQuickViewTimer()
    this.setState({ pullRequestBeingViewed: null })
    this.pullRequestQuickViewTimerId = window.setTimeout(
      () => this.setState({ pullRequestBeingViewed: { pr, prListItemTop } }),
      250
    )
  }

  private onMouseLeavePullRequestListItem = async () => {
    this.clearPullRequestQuickViewTimer()
    this.pullRequestQuickViewTimerId = window.setTimeout(
      () => this.setState({ pullRequestBeingViewed: null }),
      500
    )
  }

  private onTabClicked = (tab: BranchesTab) => {
    this.props.dispatcher.changeBranchesTab(tab)
  }

  private onMergeClick = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.startMergeBranchOperation(this.props.repository)
  }

  private onBranchItemClick = (branch: Branch) => {
    const { repository, dispatcher } = this.props
    dispatcher.closeFoldout(FoldoutType.Branch)

    const timer = startTimer('checkout branch from list', repository)
    dispatcher.checkoutBranch(repository, branch).then(() => timer.done())
  }

  private onBranchSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })
  }

  private onBranchFilterTextChanged = (text: string) => {
    this.setState({ branchFilterText: text })
  }

  private onCreateBranchWithName = (name: string) => {
    const { repository, dispatcher } = this.props

    dispatcher.closeFoldout(FoldoutType.Branch)
    dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository,
      initialName: name,
    })
  }

  private onCreateBranch = () => {
    this.onCreateBranchWithName('')
  }

  private onPullRequestSelectionChanged = (
    selectedPullRequest: PullRequest | null
  ) => {
    this.setState({ selectedPullRequest })
  }

  /**
   * Method is to handle when something is dragged and dropped onto a branch
   * in the branch dropdown.
   *
   * Currently this is being implemented with cherry picking. But, this could be
   * expanded if we ever dropped something else on a branch; in which case,
   * we would likely have to check the app state to see what action is being
   * performed. As this branch container is not being used anywhere except
   * for the branch dropdown, we are not going to pass the repository state down
   * during this implementation.
   */
  private onDropOntoBranch = (branchName: string) => {
    const branch = this.props.allBranches.find(b => b.name === branchName)
    if (branch === undefined) {
      log.warn(
        '[branches-container] - Branch name of branch dropped on does not exist.'
      )
      return
    }

    if (dragAndDropManager.isDragOfType(DragType.Commit)) {
      this.props.dispatcher.startCherryPickWithBranch(
        this.props.repository,
        branch
      )
    }
  }

  private onDropOntoCurrentBranch = () => {
    if (dragAndDropManager.isDragOfType(DragType.Commit)) {
      this.props.dispatcher.incrementMetric('dragStartedAndCanceledCount')
    }
  }

  private clearPullRequestQuickViewTimer = () => {
    if (this.pullRequestQuickViewTimerId === null) {
      return
    }

    window.clearTimeout(this.pullRequestQuickViewTimerId)
    this.pullRequestQuickViewTimerId = null
  }
}
