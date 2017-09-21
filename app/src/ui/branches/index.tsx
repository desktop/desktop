import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { FoldoutType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { BranchList } from './branch-list'
import { Account } from '../../models/account'
import { IAPIPullRequest, API, APIRefState } from '../../lib/api'

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly account: Account | null
}

interface IPullRequest extends IAPIPullRequest {
  readonly state: APIRefState
}

interface IBranchesState {
  readonly selectedBranch: Branch | null
  readonly filterText: string

  readonly pullRequests: ReadonlyArray<IPullRequest> | null
}

/** The Branches list component. */
export class Branches extends React.Component<IBranchesProps, IBranchesState> {
  public constructor(props: IBranchesProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
      filterText: '',
      pullRequests: null,
    }
  }

  public componentDidMount() {
    this.fetchPullRequests()
  }

  private async fetchPullRequests() {
    const account = this.props.account
    if (!account) {
      return
    }

    const gitHubRepository = this.props.repository.gitHubRepository
    if (!gitHubRepository) {
      return
    }

    const api = API.fromAccount(account)
    try {
      const pullRequests = await api.fetchPullRequests(
        gitHubRepository.owner.login,
        gitHubRepository.name,
        'open'
      )

      const pullRequestsWithStatus: Array<IPullRequest> = []
      for (const pr of pullRequests) {
        try {
          const state = await api.fetchCombinedRefStatus(
            pr.head.repo.owner.login,
            pr.head.repo.name,
            pr.head.sha
          )
          pullRequestsWithStatus.push({
            ...pr,
            state,
          })
        } catch (e) {
          pullRequestsWithStatus.push({
            ...pr,
            state: 'pending',
          })
        }
      }

      this.setState({ pullRequests: pullRequestsWithStatus })
    } catch (e) {
      this.setState({ pullRequests: null })
    }
  }

  private onItemClick = (item: Branch) => {
    this.props.dispatcher.closeFoldout(FoldoutType.Branch)

    const currentBranch = this.props.currentBranch

    if (!currentBranch || currentBranch.name !== item.name) {
      this.props.dispatcher.checkoutBranch(
        this.props.repository,
        item.nameWithoutRemote
      )
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

  private onSelectionChanged = (selectedBranch: Branch) => {
    this.setState({ selectedBranch })
  }

  public render() {
    return (
      <div className="branches-list-container">
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
          onSelectionChanged={this.onSelectionChanged}
        />
      </div>
    )
  }
}
