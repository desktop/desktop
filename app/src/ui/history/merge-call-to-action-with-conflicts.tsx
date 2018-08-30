import * as React from 'react'

import { CompareActionKind, MergeResultStatus } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'
import { MergeStatusHeader } from './merge-status-header'
import { MergeResultKind } from '../../models/merge'

interface IMergeCallToActionWithConflictsProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly mergeStatus: MergeResultStatus | null
  readonly currentBranch: Branch
  readonly comparisonBranch: Branch
  readonly commitsBehind: number

  /**
   * Callback to execute after a merge has been performed
   */
  readonly onMerged: () => void
}

export class MergeCallToActionWithConflicts extends React.Component<
  IMergeCallToActionWithConflictsProps,
  {}
> {
  public render() {
    const { commitsBehind } = this.props

    return (
      <div className="merge-cta">
        <Button
          type="submit"
          disabled={commitsBehind <= 0}
          onClick={this.onMergeClicked}
        >
          Merge into <strong>{this.props.currentBranch.name}</strong>
        </Button>

        <MergeStatusHeader status={this.props.mergeStatus} />

        {this.renderMergeDetails(
          this.props.currentBranch,
          this.props.comparisonBranch,
          this.props.mergeStatus,
          commitsBehind
        )}
      </div>
    )
  }

  private renderMergeDetails(
    currentBranch: Branch,
    comparisonBranch: Branch,
    mergeStatus: MergeResultStatus | null,
    behindCount: number
  ) {
    if (mergeStatus === null || mergeStatus.kind === MergeResultKind.Loading) {
      return (
        <div className="merge-message">
          Checking for ability to merge automatically...
        </div>
      )
    }
    const branch = comparisonBranch

    if (mergeStatus.kind === MergeResultKind.Clean) {
      const count = behindCount

      if (count > 0) {
        const pluralized = count === 1 ? 'commit' : 'commits'
        return (
          <div className="merge-message">
            This will merge
            <strong>{` ${count} ${pluralized}`}</strong>
            {` `}
            from
            {` `}
            <strong>{branch.name}</strong>
            {` `}
            into
            {` `}
            <strong>{currentBranch.name}</strong>
          </div>
        )
      } else {
        return null
      }
    }

    if (mergeStatus.kind === MergeResultKind.Invalid) {
      return (
        <p className="merge-info">
          Cannot test merging
          {` `}
          <strong>{branch.name}</strong>
          {` `}
          into
          {` `}
          <strong>{currentBranch.name}</strong>
          {` `}
          as these are separate histories
        </p>
      )
    }

    const count = mergeStatus.conflictedFiles
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <div className="merge-message">
        There will be
        <strong>{` ${count} conflicted ${pluralized}`}</strong>
        {` `}
        when merging
        {` `}
        <strong>{branch.name}</strong>
        {` `}
        into
        {` `}
        <strong>{currentBranch.name}</strong>
      </div>
    )
  }

  private onMergeClicked = async () => {
    const { comparisonBranch, repository } = this.props

    this.props.dispatcher.recordCompareInitiatedMerge()

    await this.props.dispatcher.mergeBranch(repository, comparisonBranch.name)

    this.props.dispatcher.executeCompare(repository, {
      kind: CompareActionKind.History,
    })

    this.props.dispatcher.updateCompareForm(repository, {
      showBranchList: false,
      filterText: '',
    })
    this.props.onMerged()
  }
}
