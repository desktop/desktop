import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { OcticonSymbol } from '../octicons'
import { Repository } from '../../models/repository'
import { TipState } from '../../models/tip'
import { ToolbarDropdown, DropdownState } from './dropdown'
import { IRepositoryState } from '../../lib/app-state'
import { Branches } from '../branches'
import { assertNever } from '../../lib/fatal-error'
import { Account } from '../../models/account'
import { BranchesTab } from '../../models/branches-tab'
import { enablePreviewFeatures } from '../../lib/feature-flag'
import { API } from '../../lib/api'
import { IPullRequest } from '../../models/pull-request'
import { GitHubRepository } from '../../models/github-repository'
import { Branch } from '../../models/branch'
import { PullRequestBadge } from '../branches/pull-request-badge'

const RefreshPullRequestInterval = 1000 * 60 * 10

interface IBranchDropdownProps {
  readonly dispatcher: Dispatcher

  /** The currently selected repository. */
  readonly repository: Repository

  /** The current repository state as derived from AppState */
  readonly repositoryState: IRepositoryState

  /** Whether or not the branch dropdown is currently open */
  readonly isOpen: boolean

  /**
   * An event handler for when the drop down is opened, or closed, by a pointer
   * event or by pressing the space or enter key while focused.
   *
   * @param state    - The new state of the drop down
   */
  readonly onDropDownStateChanged: (state: DropdownState) => void

  /** The account for the associated GitHub repository, if one exists. */
  readonly account: Account | null

  /** The currently selected tab. */
  readonly selectedTab: BranchesTab
}

interface IBranchDropdownState {
  readonly pullRequests: ReadonlyArray<IPullRequest> | null
}

/**
 * A drop down for selecting the currently checked out branch.
 */
export class BranchDropdown extends React.Component<
  IBranchDropdownProps,
  IBranchDropdownState
> {
  private refeshPullRequestTimerId: number | null = null

  public constructor(props: IBranchDropdownProps) {
    super(props)

    this.state = { pullRequests: null }
  }

  private renderBranchFoldout = (): JSX.Element | null => {
    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState

    const tip = repositoryState.branchesState.tip
    const currentBranch = tip.kind === TipState.Valid ? tip.branch : null

    return (
      <Branches
        allBranches={branchesState.allBranches}
        recentBranches={branchesState.recentBranches}
        currentBranch={currentBranch}
        defaultBranch={branchesState.defaultBranch}
        dispatcher={this.props.dispatcher}
        repository={this.props.repository}
        account={this.props.account}
        selectedTab={this.props.selectedTab}
        pullRequests={this.state.pullRequests}
      />
    )
  }

  public componentDidMount() {
    if (enablePreviewFeatures()) {
      this.updatePullRequests(this.props)

      this.refeshPullRequestTimerId = window.setInterval(
        () => this.updatePullRequests(this.props),
        RefreshPullRequestInterval
      )
    }
  }

  public componentWillReceiveProps(nextProps: IBranchDropdownProps) {
    if (
      enablePreviewFeatures() &&
      (this.props.account !== nextProps.account ||
        this.props.repository !== nextProps.repository)
    ) {
      this.setState({ pullRequests: null })
      this.updatePullRequests(nextProps)
    }
  }

  public componentWillUnmount() {
    const timerId = this.refeshPullRequestTimerId
    if (timerId) {
      window.clearInterval(timerId)
      this.refeshPullRequestTimerId = null
    }
  }

  private async fetchPullRequests(
    account: Account,
    repository: GitHubRepository
  ): Promise<ReadonlyArray<IPullRequest> | null> {
    const api = API.fromAccount(account)
    try {
      const pullRequests = await api.fetchPullRequests(
        repository.owner.login,
        repository.name,
        'open'
      )

      const pullRequestsWithStatus: Array<IPullRequest> = []
      for (const pr of pullRequests) {
        try {
          const state = await api.fetchCombinedRefStatus(
            repository.owner.login,
            repository.name,
            pr.head.sha
          )

          pullRequestsWithStatus.push({
            ...pr,
            state,
            created: new Date(pr.created_at),
          })
        } catch (e) {
          pullRequestsWithStatus.push({
            ...pr,
            state: 'pending',
            created: new Date(pr.created_at),
          })
        }
      }

      return pullRequestsWithStatus
    } catch (e) {
      return null
    }
  }

  private async updatePullRequests(props: IBranchDropdownProps) {
    const account = props.account
    if (!account) {
      return
    }

    const gitHubRepository = props.repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const pullRequests = await this.fetchPullRequests(account, gitHubRepository)
    this.setState({ pullRequests })
  }

  private get currentPullRequest(): IPullRequest | null {
    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState
    const pullRequests = this.state.pullRequests
    const gitHubRepository = this.props.repository.gitHubRepository

    const tip = branchesState.tip
    if (tip.kind === TipState.Valid && pullRequests && gitHubRepository) {
      return findCurrentPullRequest(tip.branch, pullRequests, gitHubRepository)
    } else {
      return null
    }
  }

  private onDropDownStateChanged = (state: DropdownState) => {
    // Don't allow opening the drop down when checkout is in progress
    if (state === 'open' && this.props.repositoryState.checkoutProgress) {
      return
    }

    this.props.onDropDownStateChanged(state)
  }

  public render() {
    const repositoryState = this.props.repositoryState
    const branchesState = repositoryState.branchesState

    const tip = branchesState.tip
    const tipKind = tip.kind

    let icon = OcticonSymbol.gitBranch
    let iconClassName: string | undefined = undefined
    let title: string
    let description = __DARWIN__ ? 'Current Branch' : 'Current branch'
    let canOpen = true
    let tooltip: string

    if (this.currentPullRequest) {
      icon = OcticonSymbol.gitPullRequest
    }

    if (tip.kind === TipState.Unknown) {
      // TODO: this is bad and I feel bad
      return null
    } else if (tip.kind === TipState.Unborn) {
      title = tip.ref
      tooltip = `Current branch is ${tip.ref}`
      canOpen = false
    } else if (tip.kind === TipState.Detached) {
      title = `On ${tip.currentSha.substr(0, 7)}`
      tooltip = 'Currently on a detached HEAD'
      icon = OcticonSymbol.gitCommit
      description = 'Detached HEAD'
    } else if (tip.kind === TipState.Valid) {
      title = tip.branch.name
      tooltip = `Current branch is ${title}`
    } else {
      return assertNever(tip, `Unknown tip state: ${tipKind}`)
    }

    const checkoutProgress = repositoryState.checkoutProgress
    let progressValue: number | undefined = undefined

    if (checkoutProgress) {
      title = checkoutProgress.targetBranch
      description = __DARWIN__ ? 'Switching to Branch' : 'Switching to branch'

      if (checkoutProgress.value > 0) {
        const friendlyProgress = Math.round(checkoutProgress.value * 100)
        description = `${description} (${friendlyProgress} %)`
      }

      progressValue = checkoutProgress.value
      icon = OcticonSymbol.sync
      iconClassName = 'spin'
      canOpen = false
    }

    const isOpen = this.props.isOpen
    const currentState: DropdownState = isOpen && canOpen ? 'open' : 'closed'

    return (
      <ToolbarDropdown
        className="branch-button"
        icon={icon}
        iconClassName={iconClassName}
        title={title}
        description={description}
        tooltip={tooltip}
        onDropdownStateChanged={this.onDropDownStateChanged}
        dropdownContentRenderer={this.renderBranchFoldout}
        dropdownState={currentState}
        showDisclosureArrow={canOpen}
        progressValue={progressValue}
      >
        {this.renderPullRequestInfo()}
      </ToolbarDropdown>
    )
  }

  private renderPullRequestInfo() {
    const pr = this.currentPullRequest
    if (!pr) {
      return null
    }

    if (!enablePreviewFeatures()) {
      return null
    }

    return <PullRequestBadge number={pr.number} status={pr.state} />
  }
}

function findCurrentPullRequest(
  currentBranch: Branch,
  pullRequests: ReadonlyArray<IPullRequest>,
  gitHubRepository: GitHubRepository
): IPullRequest | null {
  const upstream = currentBranch.upstreamWithoutRemote
  if (!upstream) {
    return null
  }

  for (const pr of pullRequests) {
    if (
      pr.head.ref === upstream &&
      // TODO: This doesn't work for when I've checked out a PR from a fork.
      pr.head.repo.clone_url === gitHubRepository.cloneURL
    ) {
      return pr
    }
  }

  return null
}
