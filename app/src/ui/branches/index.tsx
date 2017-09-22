import * as React from 'react'
import { Dispatcher } from '../../lib/dispatcher'
import { FoldoutType } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { BranchList } from './branch-list'
import { Account } from '../../models/account'
import { TabBar } from '../tab-bar'
import { BranchesTab } from '../../models/branches-tab'
import { assertNever } from '../../lib/fatal-error'
import { enablePreviewFeatures } from '../../lib/feature-flag'
import { IPullRequest } from '../../models/pull-request'
import { PullRequestList } from './pull-request-list'

interface IBranchesProps {
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly account: Account | null
  readonly selectedTab: BranchesTab
  readonly pullRequests: ReadonlyArray<IPullRequest> | null
}

interface IBranchesState {
  readonly selectedBranch: Branch | null
  readonly filterText: string
}

/** The Branches list component. */
export class Branches extends React.Component<IBranchesProps, IBranchesState> {
  public constructor(props: IBranchesProps) {
    super(props)

    this.state = {
      selectedBranch: props.currentBranch,
      filterText: '',
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

  private renderTabBar() {
    if (!this.props.account) {
      return null
    }

    if (!enablePreviewFeatures()) {
      return null
    }

    const count = this.props.pullRequests ? this.props.pullRequests.length : 0
    return (
      <TabBar
        onTabClicked={this.onTabClicked}
        selectedIndex={this.props.selectedTab}
      >
        <span>Branches</span>
        <span className="pull-request-tab">
          {__DARWIN__ ? 'Pull Requests' : 'Pull requests'}

          <span className="count">{count}</span>
        </span>
      </TabBar>
    )
  }

  private renderSelectedTab() {
    const tab = this.props.selectedTab
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
            onSelectionChanged={this.onSelectionChanged}
          />
        )

      case BranchesTab.PullRequests: {
        const pullRequests = this.props.pullRequests
        if (pullRequests) {
          return <PullRequestList pullRequests={pullRequests} />
        } else {
          return <div>Loading and we should have a facade here…</div>
        }
      }
    }

    return assertNever(tab, `Unknown Branches tab: ${tab}`)
  }

  public render() {
    return (
      <div className="branches-container">
        {this.renderTabBar()}
        {this.renderSelectedTab()}
      </div>
    )
  }

  private onTabClicked = (tab: BranchesTab) => {
    this.props.dispatcher.changeBranchesTab(tab)
  }
}
