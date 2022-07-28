import * as React from 'react'
import {
  IBranchesState,
  IPullRequestState,
  PullRequestSectionTab,
} from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { TipState } from '../../models/tip'
import { Dispatcher } from '../dispatcher'
import { UiView } from '../ui-view'
import { PullRequestCompareBar } from './pull-request-compare-bar'
import { PullRequestTabs } from './pull-request-tabs'

interface IPullRequestViewProps {
  readonly branchesState: IBranchesState
  readonly pullRequestState: IPullRequestState

  readonly dispatcher: Dispatcher
  readonly repository: Repository
}

export class PullRequestView extends React.Component<IPullRequestViewProps> {
  private onPullRequestTabChange = (tab: PullRequestSectionTab) => {
    this.props.dispatcher.updatePullRequestSection(this.props.repository, tab)
  }

  public render() {
    const { branchesState, pullRequestState } = this.props
    const { tip, allBranches } = branchesState
    const { mergeBaseBranch, selectedSection } = pullRequestState

    if (tip.kind !== TipState.Valid) {
      return null
    }

    const currentBranch = tip.branch

    return (
      <UiView id="repository-pull-request-view">
        <PullRequestCompareBar
          branches={allBranches}
          currentBranch={currentBranch}
          mergeBaseBranch={mergeBaseBranch}
        />
        <PullRequestTabs
          selectedSection={selectedSection}
          onTabClicked={this.onPullRequestTabChange}
        />
      </UiView>
    )
  }
}
