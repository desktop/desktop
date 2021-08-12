import { RebaseConflictState } from '../../lib/app-state'
import {
  instanceOfIBaseRebaseDetails,
  MultiCommitOperationKind,
} from '../../models/multi-commit-operation'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'

export abstract class BaseRebase extends BaseMultiCommitOperation {
  protected abstract conflictDialogOperationPrefix: string
  protected abstract rebaseKind: MultiCommitOperationKind

  protected onContinueAfterConflicts = async (): Promise<void> => {
    const {
      repository,
      dispatcher,
      workingDirectory,
      state,
      conflictState,
    } = this.props
    const { operationDetail, targetBranch, originalBranchTip } = state

    if (
      conflictState === null ||
      targetBranch === null ||
      originalBranchTip === null ||
      !instanceOfIBaseRebaseDetails(operationDetail)
    ) {
      this.endFlowInvalidState()
      return
    }

    const { commits, currentTip } = operationDetail

    await dispatcher.switchMultiCommitOperationToShowProgress(repository)

    const rebaseConflictState: RebaseConflictState = {
      kind: 'rebase',
      currentTip,
      targetBranch: targetBranch.name,
      baseBranch: undefined,
      originalBranchTip,
      baseBranchTip: currentTip,
      manualResolutions: conflictState.manualResolutions,
    }

    const rebaseResult = await dispatcher.continueRebase(
      this.rebaseKind,
      repository,
      workingDirectory,
      rebaseConflictState
    )

    return dispatcher.processMultiCommitOperationRebaseResult(
      this.rebaseKind,
      repository,
      rebaseResult,
      commits.length + 1,
      targetBranch.name
    )
  }

  protected onAbort = async (): Promise<void> => {
    const { repository, dispatcher } = this.props
    this.onFlowEnded()
    return dispatcher.abortRebase(repository)
  }

  protected onConflictsDialogDismissed = () => {
    this.onInvokeConflictsDialogDismissed(this.conflictDialogOperationPrefix)
  }
}
