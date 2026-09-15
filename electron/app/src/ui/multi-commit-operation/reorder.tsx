import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { BaseRebase } from './base-rebase'

export abstract class Reorder extends BaseRebase {
  protected conflictDialogOperationPrefix = 'reordering commits on'
  protected rebaseKind = MultiCommitOperationKind.Reorder

  protected onBeginOperation = () => {
    const { repository, dispatcher, state } = this.props
    const { operationDetail } = state

    if (operationDetail.kind !== MultiCommitOperationKind.Reorder) {
      this.endFlowInvalidState()
      return
    }

    const { commits, beforeCommit, lastRetainedCommitRef } = operationDetail

    return dispatcher.reorderCommits(
      repository,
      commits,
      beforeCommit,
      lastRetainedCommitRef,
      true
    )
  }
}
