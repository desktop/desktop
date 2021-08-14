import { MultiCommitOperationKind } from '../../models/multi-commit-operation'
import { BaseRebase } from './base-rebase'

export abstract class Rebase extends BaseRebase {
  protected conflictDialogOperationPrefix = 'rebasing'

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
}
