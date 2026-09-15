import React from 'react'
import {
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../../models/multi-commit-operation'
import { BaseRebase } from './base-rebase'
import { RebaseChooseBranchDialog } from './choose-branch/rebase-choose-branch-dialog'

export abstract class Rebase extends BaseRebase {
  protected conflictDialogOperationPrefix = 'rebasing'
  protected rebaseKind = MultiCommitOperationKind.Rebase

  protected onBeginOperation = () => {
    const { repository, dispatcher, state } = this.props
    const { operationDetail, targetBranch } = state

    if (operationDetail.kind !== MultiCommitOperationKind.Rebase) {
      this.endFlowInvalidState()
      return
    }

    const { commits, sourceBranch } = operationDetail

    if (sourceBranch === null || targetBranch === null) {
      this.endFlowInvalidState()
      return
    }

    return dispatcher.startRebase(
      repository,
      sourceBranch,
      targetBranch,
      commits,
      { continueWithForcePush: true }
    )
  }

  protected renderChooseBranch = (): JSX.Element | null => {
    const { repository, dispatcher, state } = this.props
    const { step } = state

    if (step.kind !== MultiCommitOperationStepKind.ChooseBranch) {
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

    return (
      <RebaseChooseBranchDialog
        key="choose-branch"
        dispatcher={dispatcher}
        repository={repository}
        allBranches={allBranches}
        defaultBranch={defaultBranch}
        recentBranches={recentBranches}
        currentBranch={currentBranch}
        initialBranch={initialBranch}
        operation={MultiCommitOperationKind.Rebase}
        onDismissed={this.onFlowEnded}
      />
    )
  }
}
