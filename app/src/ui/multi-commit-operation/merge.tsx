import React from 'react'
import { isMergeConflictState, RepositorySectionTab } from '../../lib/app-state'
import { getConflictedFiles } from '../../lib/status'
import { BannerType } from '../../models/banner'
import { DefaultCommitMessage } from '../../models/commit-message'
import {
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../../models/multi-commit-operation'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'
import { MergeChooseBranchDialog } from './choose-branch/merge-choose-branch-dialog'

export abstract class Merge extends BaseMultiCommitOperation {
  protected onContinueAfterConflicts = async (): Promise<void> => {
    const {
      repository,
      dispatcher,
      workingDirectory,
      state,
      conflictState,
      state: { operationDetail },
    } = this.props

    if (
      state.step.kind !== MultiCommitOperationStepKind.ShowConflicts ||
      conflictState === null ||
      !isMergeConflictState(conflictState) ||
      operationDetail.kind !== MultiCommitOperationKind.Merge
    ) {
      this.endFlowInvalidState()
      return
    }

    const { theirBranch } = state.step.conflictState
    const { currentBranch: ourBranch } = conflictState
    await dispatcher.finishConflictedMerge(
      repository,
      workingDirectory,
      {
        type: BannerType.SuccessfulMerge,
        ourBranch,
        theirBranch,
      },
      operationDetail.isSquash
    )

    await dispatcher.setCommitMessage(repository, DefaultCommitMessage)
    await this.props.dispatcher.changeRepositorySection(
      repository,
      RepositorySectionTab.Changes
    )
    this.onFlowEnded()
    dispatcher.incrementMetric('guidedConflictedMergeCompletionCount')
  }

  protected onAbort = async (): Promise<void> => {
    const {
      repository,
      dispatcher,
      state: { operationDetail },
    } = this.props
    this.onFlowEnded()
    if (
      operationDetail.kind === MultiCommitOperationKind.Merge &&
      operationDetail.isSquash
    ) {
      return dispatcher.abortSquashMerge(repository)
    }
    return dispatcher.abortMerge(repository)
  }

  protected onConflictsDialogDismissed = () => {
    const { dispatcher, workingDirectory, conflictState } = this.props
    if (conflictState === null || !isMergeConflictState(conflictState)) {
      this.endFlowInvalidState(true)
      return
    }
    dispatcher.incrementMetric('mergeConflictsDialogDismissalCount')
    const anyConflictedFiles =
      getConflictedFiles(workingDirectory, conflictState.manualResolutions)
        .length > 0
    if (anyConflictedFiles) {
      dispatcher.incrementMetric(
        'anyConflictsLeftOnMergeConflictsDialogDismissalCount'
      )
    }
    this.onInvokeConflictsDialogDismissed('merge into')
  }

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
