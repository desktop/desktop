import React from 'react'
import { CherryPickConflictState } from '../../lib/app-state'
import { Branch } from '../../models/branch'
import {
  MultiCommitOperationKind,
  MultiCommitOperationStepKind,
} from '../../models/multi-commit-operation'
import { ChooseTargetBranchDialog } from './choose-branch/choose-target-branch'
import { CreateBranch } from '../create-branch'
import { BaseMultiCommitOperation } from './base-multi-commit-operation'

export abstract class CherryPick extends BaseMultiCommitOperation {
  protected onContinueAfterConflicts = async (): Promise<void> => {
    const { repository, dispatcher, workingDirectory, state, conflictState } =
      this.props
    const { operationDetail, targetBranch } = state

    if (
      conflictState === null ||
      operationDetail.kind !== MultiCommitOperationKind.CherryPick ||
      targetBranch === null
    ) {
      this.endFlowInvalidState()
      return
    }

    const { commits } = operationDetail

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

  protected renderChooseBranch = (): JSX.Element | null => {
    const {
      state: { step, operationDetail },
    } = this.props

    if (
      step.kind !== MultiCommitOperationStepKind.ChooseBranch ||
      operationDetail.kind !== MultiCommitOperationKind.CherryPick
    ) {
      this.endFlowInvalidState()
      return null
    }

    const { allBranches, defaultBranch, currentBranch, recentBranches } = step
    const { commits } = operationDetail

    return (
      <ChooseTargetBranchDialog
        key="choose-target-branch"
        allBranches={allBranches}
        defaultBranch={defaultBranch}
        recentBranches={recentBranches}
        currentBranch={currentBranch}
        onCherryPick={this.onChooseBranch}
        onDismissed={this.onFlowEnded}
        commitCount={commits.length}
        onCreateNewBranch={this.onCreateNewBranch}
      />
    )
  }

  protected renderCreateBranch = (): JSX.Element | null => {
    const {
      repository,
      dispatcher,
      state: { step, operationDetail },
    } = this.props

    if (
      step.kind !== MultiCommitOperationStepKind.CreateBranch ||
      operationDetail.kind !== MultiCommitOperationKind.CherryPick
    ) {
      this.endFlowInvalidState()
      return null
    }

    const {
      allBranches,
      defaultBranch,
      upstreamDefaultBranch,
      upstreamGhRepo,
      tip,
      targetBranchName,
    } = step

    const okButtonText = __DARWIN__
      ? 'Create Branch and Cherry-pick'
      : 'Create branch and cherry-pick'

    const headerText = __DARWIN__
      ? 'Cherry-pick to New Branch'
      : 'Cherry-pick to new branch'

    return (
      <CreateBranch
        key="create-branch"
        tip={tip}
        defaultBranch={defaultBranch}
        upstreamDefaultBranch={upstreamDefaultBranch}
        upstreamGitHubRepository={upstreamGhRepo}
        allBranches={allBranches}
        repository={repository}
        onDismissed={this.onFlowEnded}
        dispatcher={dispatcher}
        initialName={targetBranchName}
        createBranch={this.onCreateBranchAndCherryPick}
        okButtonText={okButtonText}
        headerText={headerText}
      />
    )
  }

  protected onChooseBranch = (targetBranch: Branch) => {
    const {
      dispatcher,
      repository,
      state: { operationDetail },
    } = this.props

    if (operationDetail.kind !== MultiCommitOperationKind.CherryPick) {
      this.endFlowInvalidState()
      return
    }

    const { commits, sourceBranch } = operationDetail
    dispatcher.setMultiCommitOperationTargetBranch(repository, targetBranch)
    dispatcher.setCherryPickBranchCreated(repository, false)
    dispatcher.cherryPick(repository, targetBranch, commits, sourceBranch)
  }

  private onCreateNewBranch = (targetBranchName: string) => {
    const {
      dispatcher,
      repository,
      state: { step, operationDetail },
    } = this.props

    if (
      step.kind !== MultiCommitOperationStepKind.ChooseBranch ||
      operationDetail.kind !== MultiCommitOperationKind.CherryPick
    ) {
      this.endFlowInvalidState()
      return
    }

    const { commits, sourceBranch } = operationDetail

    dispatcher.setCherryPickCreateBranchFlowStep(
      repository,
      targetBranchName,
      commits,
      sourceBranch
    )
  }

  private onCreateBranchAndCherryPick = (
    branchName: string,
    startPoint: string | null,
    noTrackOption: boolean
  ) => {
    const {
      dispatcher,
      repository,
      state: { step, operationDetail },
    } = this.props

    if (
      step.kind !== MultiCommitOperationStepKind.CreateBranch ||
      operationDetail.kind !== MultiCommitOperationKind.CherryPick
    ) {
      this.endFlowInvalidState()
      return
    }

    const { commits, sourceBranch } = operationDetail

    dispatcher.startCherryPickWithBranchName(
      repository,
      branchName,
      startPoint,
      noTrackOption,
      commits,
      sourceBranch
    )
  }
}
