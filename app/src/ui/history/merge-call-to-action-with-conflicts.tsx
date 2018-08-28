import * as React from 'react'

import {
  CompareActionKind,
  ICompareBranch,
  MergeResultStatus,
} from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'
import { MergeStatusHeader } from './merge-status-header'

interface IMergeCallToActionWithConflictsProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly mergeStatus: MergeResultStatus | null
  readonly currentBranch: Branch
  readonly comparisonBranch: Branch
  readonly formState: ICompareBranch

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
    const behindCount = this.props.formState.aheadBehind.behind

    return (
      <div className="merge-cta">
        <Button
          type="submit"
          disabled={behindCount <= 0}
          onClick={this.onMergeClicked}
        >
          Merge into <strong>{this.props.currentBranch.name}</strong>
        </Button>

        <MergeStatusHeader status={this.props.mergeStatus} />

        {this.renderMergeDetails(
          this.props.currentBranch,
          this.props.comparisonBranch,
          this.props.mergeStatus,
          behindCount
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
    if (mergeStatus === null || mergeStatus.kind === 'loading') {
      return (
        <div className="merge-message">
          Checking for ability to merge automatically...
        </div>
      )
    }
    const branch = comparisonBranch

    if (mergeStatus.kind === 'clean') {
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

    const count = mergeStatus.conflicts
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
    const formState = this.props.formState

    this.props.dispatcher.recordCompareInitiatedMerge()

    await this.props.dispatcher.mergeBranch(
      this.props.repository,
      formState.comparisonBranch.name
    )

    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: CompareActionKind.History,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
      filterText: '',
    })
    this.props.onMerged()
  }
}
