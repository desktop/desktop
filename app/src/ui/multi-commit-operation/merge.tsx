import React from 'react'
import {
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../../models/multi-commit-operation'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'
import { MergeChooseBranchDialog } from './choose-branch/merge-choose-branch-dialog'

export abstract class Merge extends BaseMultiCommitOperation {
  protected renderChooseBranch = (): JSX.Element | null => {
    const { repository, dispatcher, state } = this.props
    const { step, operationDetail } = state

    if (
      step.kind !== MultiCommitOperationStepKind.ChooseBranch ||
      operationDetail.kind !== MultiCommitOperationKind.Merge
    ) {
      this.endFlowInvalidState()
      return null
    }

    const {
      defaultBranch,
      currentBranch,
      allBranches,
      recentBranches,
      initialBranch,
    } = step

    const { isSquash } = operationDetail

    return (
      <MergeChooseBranchDialog
        dispatcher={dispatcher}
        repository={repository}
        allBranches={allBranches}
        defaultBranch={defaultBranch}
        recentBranches={recentBranches}
        currentBranch={currentBranch}
        initialBranch={initialBranch}
        operation={
          isSquash
            ? MultiCommitOperationKind.Squash
            : MultiCommitOperationKind.Merge
        }
        onDismissed={this.onFlowEnded}
      />
    )
  }
}
