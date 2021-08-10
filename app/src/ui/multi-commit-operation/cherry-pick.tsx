import { CherryPickConflictState } from '../../lib/app-state'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'

export abstract class CherryPick extends BaseMultiCommitOperation {
  protected onContinueAfterConflicts = async (): Promise<void> => {
    const {
      repository,
      dispatcher,
      workingDirectory,
      state,
      conflictState,
    } = this.props
    const { commits, operationDetail, targetBranch } = state

    if (
      conflictState === null ||
      operationDetail.kind !== MultiCommitOperationKind.CherryPick ||
      targetBranch === null
    ) {
      this.endFlowInvalidState()
      return
    }

    await dispatcher.switchMultiCommitOperationToShowProgress(repository)

    const cherryPickConflictState: CherryPickConflictState = {
      kind: 'cherryPick',
      targetBranchName: targetBranch.name,
      manualResolutions: conflictState.manualResolutions,
    }

    await dispatcher.continueCherryPick(
      repository,
      workingDirectory.files,
      cherryPickConflictState,
      commits,
      operationDetail.sourceBranch
    )
  }

  protected onAbort = async (): Promise<void> => {
    const { repository, dispatcher, state } = this.props
    const { operationDetail } = state

    if (operationDetail.kind !== MultiCommitOperationKind.CherryPick) {
      this.endFlowInvalidState()
      return
    }

    this.onFlowEnded()
    return dispatcher.abortCherryPick(repository, operationDetail.sourceBranch)
  }

  protected onConflictsDialogDismissed = () => {
    this.onInvokeConflictsDialogDismissed('cherry-picking onto')
  }
}
