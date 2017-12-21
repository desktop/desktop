import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { FoldoutType, PopupType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { BranchList } from './branch-list'
import { TabBar } from '../tab-bar'
import { BranchesTab } from '../../models/branches-tab'
import { assertNever } from '../../lib/fatal-error'
import { enablePRIntegration } from '../../lib/feature-flag'
import { PullRequestList } from './pull-request-list'
import { PullRequestsLoading } from './pull-requests-loading'
import { NoPullRequests } from './no-pull-requests'
import { PullRequest } from '../../models/pull-request'
import { CSSTransition } from 'react-transition-group'

const PullRequestsLoadingCrossFadeInTimeout = 300
const PullRequestsLoadingCrossFadeOutTimeout = 200

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly selectedTab: BranchesTab
  readonly pullRequests: ReadonlyArray<PullRequest>

  /** The pull request associated with the current branch. */
  readonly currentPullRequest: PullRequest | null

  /** Are we currently loading pull requests? */
  readonly isLoadingPullRequests: boolean
}

interface IBranchesState {
  readonly selectedBranch: Branch | null
  readonly selectedPullRequest: PullRequest | null
  readonly filterText: string
}

/** The unified Branches and Pull Requests component. */
export class BranchesContainer extends React.Component<
  IBranchesProps,
  IBranchesState
> {
  public constructor(props: IBranchesProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
      selectedPullRequest: props.currentPullRequest,
      filterText: '',
    }
  }

  private onItemClick = (item: Branch) => {
    this.checkoutBranch(item.nameWithoutRemote)
  }

  private checkoutBranch(branch: string) {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)

    const currentBranch = this.props.currentBranch

    if (!currentBranch || currentBranch.name !== branch) {
      this.props.dispatcher.checkoutBranch(this.props.repository, branch)
    }
  }

  private onFilterKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (this.state.filterText.length === 0) {
        this.props.dispatcher.closeFoldout(FoldoutType.Branch)
        event.preventDefault()
      }
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onBranchSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })
  }

  private onPullRequestSelectionChanged = (
    selectedPullRequest: PullRequest | null
  ) => {
    this.setState({ selectedPullRequest })
  }

  private renderTabBar() {
    if (!this.props.repository.gitHubRepository) {
      return null
    }

    if (!enablePRIntegration()) {
      return null
    }

    let countElement = null
    if (this.props.pullRequests) {
      countElement = (
        <span className="count">{this.props.pullRequests.length}</span>
      )
    }

    return (
      <TabBar
        onTabClicked={this.onTabClicked}
        selectedIndex={this.props.selectedTab}
      >
        <span>Branches</span>
        <span className="pull-request-tab">
          {__DARWIN__ ? 'Pull Requests' : 'Pull requests'}

          {countElement}
        </span>
      </TabBar>
    )
  }

  private renderSelectedTab() {
    let tab = this.props.selectedTab
    if (!enablePRIntegration() || !this.props.repository.gitHubRepository) {
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
            onItemClick={this.onItemClick}
            filterText={this.state.filterText}
            onFilterKeyDown={this.onFilterKeyDown}
            onFilterTextChanged={this.onFilterTextChanged}
            selectedBranch={this.state.selectedBranch}
            onSelectionChanged={this.onBranchSelectionChanged}
            canCreateNewBranch={true}
            onCreateNewBranch={this.onCreateBranchWithName}
          />
        )

      case BranchesTab.PullRequests: {
        return (
          <CSSTransition
            classNames="cross-fade"
            component="div"
            id="pr-transition-div"
            timeout={{
              enter: PullRequestsLoadingCrossFadeInTimeout,
              exit: PullRequestsLoadingCrossFadeOutTimeout,
            }}
          >
            {this.renderPullRequests()}
          </CSSTransition>
        )
      }
    }

    return assertNever(tab, `Unknown Branches tab: ${tab}`)
  }

  private renderPullRequests(): JSX.Element {
    const pullRequests = this.props.pullRequests
    if (pullRequests.length) {
      return (
        <PullRequestList
          key="pr-list"
          pullRequests={pullRequests}
          onSelectionChanged={this.onPullRequestSelectionChanged}
          selectedPullRequest={this.state.selectedPullRequest}
          onItemClick={this.onPullRequestClicked}
          onDismiss={this.onDismiss}
        />
      )
    } else if (this.props.isLoadingPullRequests) {
      return <PullRequestsLoading key="prs-loading" />
    } else {
      const repo = this.props.repository
      const name = repo.gitHubRepository
        ? repo.gitHubRepository.fullName
        : repo.name
      const isOnDefaultBranch =
        this.props.defaultBranch &&
        this.props.currentBranch &&
        this.props.defaultBranch.name === this.props.currentBranch.name
      return (
        <NoPullRequests
          key="no-prs"
          repositoryName={name}
          isOnDefaultBranch={!!isOnDefaultBranch}
          onCreateBranch={this.onCreateBranch}
          onCreatePullRequest={this.onCreatePullRequest}
        />
      )
    }
  }

  public render() {
    return (
      <div className="branches-container">
        {this.renderTabBar()}
        {this.renderSelectedTab()}
      </div>
    )
  }

  private onCreateBranchWithName = (name: string) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.showPopup({
      type: PopupType.CreateBranch,
      repository: this.props.repository,
      initialName: name,
    })
  }

  private onCreateBranch = () => {
    this.onCreateBranchWithName('')
  }

  private onCreatePullRequest = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
    this.props.dispatcher.createPullRequest(this.props.repository)
  }

  private onTabClicked = (tab: BranchesTab) => {
    this.props.dispatcher.changeBranchesTab(tab)
  }

  private onPullRequestClicked = (pullRequest: PullRequest) => {
    const gitHubRepository = this.props.repository.gitHubRepository
    if (!gitHubRepository) {
      return log.error(
        `We shouldn't be checking out a PR on a repository that doesn't have a GitHub repository.`
      )
    }

    const head = pullRequest.head
    const isRefInThisRepo =
      head.gitHubRepository &&
      head.gitHubRepository.cloneURL === gitHubRepository.cloneURL
    if (isRefInThisRepo) {
      this.checkoutBranch(head.ref)
    } else {
      log.debug(
        `onPullRequestClicked, but we can't checkout the branch: '${
          head.ref
        }' belongs to fork '${pullRequest.author}'`
      )
      // TODO: It's in a fork so we'll need to do ... something.
    }

    this.onPullRequestSelectionChanged(pullRequest)
  }

  private onDismiss = () => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)
  }
}
