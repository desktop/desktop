import * as React from 'react'

import { HistoryTabMode } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { ActionStatusIcon } from '../lib/action-status-icon'
import { MergeTreeResult } from '../../models/merge'
import { ComputedAction } from '../../models/computed-action'

interface IMergeCallToActionWithConflictsProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly mergeStatus: MergeTreeResult | null
  readonly currentBranch: Branch
  readonly comparisonBranch: Branch
  readonly commitsBehind: number
}

export class MergeCallToActionWithConflicts extends React.Component<
  IMergeCallToActionWithConflictsProps,
  {}
> {
  public render() {
    const { commitsBehind } = this.props

    const cannotMergeBranch =
      this.props.mergeStatus != null &&
      this.props.mergeStatus.kind === ComputedAction.Invalid

    const disabled = commitsBehind <= 0 || cannotMergeBranch

    const mergeDetails = commitsBehind > 0 ? this.renderMergeStatus() : null

    return (
      <div className="merge-cta">
        {mergeDetails}

        <Button type="submit" disabled={disabled} onClick={this.onMergeClicked}>
          Merge into <strong>{this.props.currentBranch.name}</strong>
        </Button>
      </div>
    )
  }

  private renderMergeStatus() {
    return (
      <div className="merge-status-component">
        <ActionStatusIcon
          status={this.props.mergeStatus}
          classNamePrefix="merge-status"
        />

        {this.renderMergeDetails(
          this.props.currentBranch,
          this.props.comparisonBranch,
          this.props.mergeStatus,
          this.props.commitsBehind
        )}
      </div>
    )
  }

  private renderMergeDetails(
    currentBranch: Branch,
    comparisonBranch: Branch,
    mergeStatus: MergeTreeResult | null,
    behindCount: number
  ) {
    if (mergeStatus === null) {
      return null
    }

    if (mergeStatus.kind === ComputedAction.Loading) {
      return this.renderLoadingMergeMessage()
    }
    if (mergeStatus.kind === ComputedAction.Clean) {
      return this.renderCleanMergeMessage(
        currentBranch,
        comparisonBranch,
        behindCount
      )
    }
    if (mergeStatus.kind === ComputedAction.Invalid) {
      return this.renderInvalidMergeMessage()
    }
    if (mergeStatus.kind === ComputedAction.Conflicts) {
      return this.renderConflictedMergeMessage(
        currentBranch,
        comparisonBranch,
        mergeStatus.conflictedFiles
      )
    }
    return null
  }

  private renderLoadingMergeMessage() {
    return (
      <div className="merge-message merge-message-loading">
        Checking for ability to merge automatically...
      </div>
    )
  }

  private renderCleanMergeMessage(
    currentBranch: Branch,
    branch: Branch,
    count: number
  ) {
    if (count > 0) {
      const pluralized = count === 1 ? 'commit' : 'commits'
      return (
        <div className="merge-message">
          This will merge
          <strong>{` ${count} ${pluralized}`}</strong>
          {` from `}
          <strong>{branch.name}</strong>
          {` into `}
          <strong>{currentBranch.name}</strong>
        </div>
      )
    } else {
      return null
    }
  }

  private renderInvalidMergeMessage() {
    return (
      <div className="merge-message">
        Unable to merge unrelated histories in this repository
      </div>
    )
  }

  private renderConflictedMergeMessage(
    currentBranch: Branch,
    branch: Branch,
    count: number
  ) {
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <div className="merge-message">
        There will be
        <strong>{` ${count} conflicted ${pluralized}`}</strong>
        {` when merging `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </div>
    )
  }

  private onMergeClicked = async () => {
    const { comparisonBranch, repository, mergeStatus } = this.props

    this.props.dispatcher.recordCompareInitiatedMerge()

    await this.props.dispatcher.mergeBranch(
      repository,
      comparisonBranch.name,
      mergeStatus
    )

    this.props.dispatcher.executeCompare(repository, {
      kind: HistoryTabMode.History,
    })

    this.props.dispatcher.updateCompareForm(repository, {
      showBranchList: false,
      filterText: '',
    })
  }
}
