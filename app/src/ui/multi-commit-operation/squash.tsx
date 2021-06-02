import { RebaseConflictState } from '../../lib/app-state'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'

export abstract class Squash extends BaseMultiCommitOperation {
  protected onBeginOperation = () => {
    const { repository, dispatcher, state } = this.props
    const { commits, operationDetail } = state

    if (operationDetail.kind !== MultiCommitOperationKind.Squash) {
      this.endFlowInvalidState()
      return
    }

    const {
      targetCommit,
      lastRetainedCommitRef,
      commitContext,
    } = operationDetail

    return dispatcher.squash(
      repository,
      commits,
      targetCommit,
      lastRetainedCommitRef,
      commitContext
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
    const { commits, currentTip, targetBranch, originalBranchTip } = state

    if (conflictState === null) {
      this.endFlowInvalidState()
      return
    }

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
      repository,
      workingDirectory,
      rebaseConflictState
    )

    return dispatcher.processSquashRebaseResult(
      repository,
      rebaseResult,
      commits,
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
