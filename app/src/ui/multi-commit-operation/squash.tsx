import { RebaseConflictState } from '../../lib/app-state'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'

export abstract class Squash extends BaseMultiCommitOperation {
  protected onBeginOperation = () => {
    const { repository, dispatcher, state } = this.props
    const { operationDetail } = state

    if (operationDetail.kind !== MultiCommitOperationKind.Squash) {
      this.endFlowInvalidState()
      return
    }

    const {
      targetCommit,
      lastRetainedCommitRef,
      commitContext,
      commits,
    } = operationDetail

    return dispatcher.squash(
      repository,
      commits,
      targetCommit,
      lastRetainedCommitRef,
      commitContext,
      true
    )
  }

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
      operationDetail.kind !== MultiCommitOperationKind.Squash
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
      MultiCommitOperationKind.Squash,
      repository,
      workingDirectory,
      rebaseConflictState
    )

    return dispatcher.processMultiCommitOperationRebaseResult(
      MultiCommitOperationKind.Squash,
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
    this.onInvokeConflictsDialogDismissed('squashing commits on')
  }
}
