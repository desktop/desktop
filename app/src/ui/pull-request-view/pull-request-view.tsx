import * as React from 'react'
import { IBranchesState, IPullRequestState } from '../../lib/app-state'
import { TipState } from '../../models/tip'
import { UiView } from '../ui-view'
import { PullRequestCompareBar } from './pull-request-compare-bar'

interface IPullRequestViewProps {
  readonly branchesState: IBranchesState
  readonly pullRequestState: IPullRequestState
}

export class PullRequestView extends React.Component<IPullRequestViewProps> {
  public render() {
    const { branchesState, pullRequestState } = this.props
    const { tip, allBranches } = branchesState
    const { mergeBaseBranch } = pullRequestState

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
      </UiView>
    )
  }
}
