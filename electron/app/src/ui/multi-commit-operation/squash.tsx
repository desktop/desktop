import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { BaseRebase } from './base-rebase'

export abstract class Squash extends BaseRebase {
  protected conflictDialogOperationPrefix = 'squashing commits on'
  protected rebaseKind = MultiCommitOperationKind.Squash

  protected onBeginOperation = () => {
    const { repository, dispatcher, state } = this.props
    const { operationDetail } = state

    if (operationDetail.kind !== MultiCommitOperationKind.Squash) {
      this.endFlowInvalidState()
      return
    }

    const { targetCommit, lastRetainedCommitRef, commitContext, commits } =
      operationDetail

    return dispatcher.squash(
      repository,
      commits,
      targetCommit,
      lastRetainedCommitRef,
      commitContext,
      true
    )
  }
}
