import React from 'react'
import {
  getAheadBehind,
  mergeTree,
  revSymmetricDifference,
} from '../../../lib/git'
import { promiseWithMinimumTimeout } from '../../../lib/promise'
import { Branch } from '../../../models/branch'
import { ComputedAction } from '../../../models/computed-action'
import { MergeTreeResult } from '../../../models/merge'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { ActionStatusIcon } from '../../lib/action-status-icon'
import { BaseChooseBranchDialog } from './base-choose-branch-dialog'

export abstract class MergeChooseBranchDialog extends BaseChooseBranchDialog {
  private commitCount: number = 0
  private mergeStatus: MergeTreeResult | null = null

  protected start = () => {
    if (!this.canStart()) {
      return
    }

    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    this.props.dispatcher.mergeBranch(
      this.props.repository,
      branch.name,
      this.mergeStatus
    )
    this.props.onDismissed()
  }

  protected canStart = (): boolean => {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    const selectedBranchIsCurrentBranch =
      selectedBranch !== null &&
      currentBranch !== null &&
      selectedBranch.name === currentBranch.name

    const isBehind = this.commitCount !== undefined && this.commitCount > 0

    const canMergeBranch =
      this.mergeStatus === null ||
      this.mergeStatus.kind !== ComputedAction.Invalid

    return (
      selectedBranch !== null &&
      !selectedBranchIsCurrentBranch &&
      isBehind &&
      canMergeBranch
    )
  }

  protected onSelectionChanged = async (selectedBranch: Branch | null) => {
    if (selectedBranch != null) {
      this.setState({ selectedBranch })
      return this.updateStatus(selectedBranch)
    }

    // return to empty state
    this.setState({ selectedBranch })
    this.commitCount = 0
    this.mergeStatus = null
  }

  protected renderActionStatusIcon = () => {
    return (
      <ActionStatusIcon
        status={this.mergeStatus}
        classNamePrefix="merge-status"
      />
    )
  }

  protected getDialogTitle = (branchName: string) => {
    const squashPrefix =
      this.props.operation === MultiCommitOperationKind.Squash
        ? 'Squash and '
        : null
    return (
      <>
        {squashPrefix}Merge into <strong>{branchName}</strong>
      </>
    )
  }

  protected updateStatus = async (branch: Branch) => {
    const { currentBranch } = this.props
    this.mergeStatus = { kind: ComputedAction.Loading }
    this.updateMergeStatusPreview(branch)

    if (currentBranch != null) {
      this.mergeStatus = await promiseWithMinimumTimeout(
        () => mergeTree(this.props.repository, currentBranch, branch),
        500
      )

      this.updateMergeStatusPreview(branch)
    }

    const range = revSymmetricDifference('', branch.name)
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    this.commitCount = aheadBehind ? aheadBehind.behind : 0

    if (this.state.selectedBranch !== branch) {
      this.commitCount = 0
    }

    this.updateMergeStatusPreview(branch)
  }

  private updateMergeStatusPreview(branch: Branch) {
    this.setState({ statusPreview: this.getMergeStatusPreview(branch) })
  }

  private getMergeStatusPreview(branch: Branch): JSX.Element | null {
    const { currentBranch } = this.props

    if (this.mergeStatus === null) {
      return null
    }

    if (this.mergeStatus.kind === ComputedAction.Loading) {
      return this.renderLoadingMergeMessage()
    }

    if (this.mergeStatus.kind === ComputedAction.Clean) {
      return this.renderCleanMergeMessage(
        branch,
        currentBranch,
        this.commitCount
      )
    }

    if (this.mergeStatus.kind === ComputedAction.Invalid) {
      return this.renderInvalidMergeMessage()
    }

    return this.renderConflictedMergeMessage(
      branch,
      currentBranch,
      this.mergeStatus.conflictedFiles
    )
  }

  private renderLoadingMergeMessage() {
    return (
      <React.Fragment>
        Checking for ability to merge automatically...
      </React.Fragment>
    )
  }

  private renderCleanMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    commitCount: number
  ) {
    if (commitCount === 0) {
      return (
        <React.Fragment>
          {`This branch is up to date with `}
          <strong>{branch.name}</strong>
        </React.Fragment>
      )
    }

    const pluralized = commitCount === 1 ? 'commit' : 'commits'
    return (
      <React.Fragment>
        This will merge
        <strong>{` ${commitCount} ${pluralized}`}</strong>
        {` from `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </React.Fragment>
    )
  }

  private renderInvalidMergeMessage() {
    return (
      <React.Fragment>
        Unable to merge unrelated histories in this repository
      </React.Fragment>
    )
  }

  private renderConflictedMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    count: number
  ) {
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <React.Fragment>
        There will be
        <strong>{` ${count} conflicted ${pluralized}`}</strong>
        {` when merging `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </React.Fragment>
    )
  }
}
