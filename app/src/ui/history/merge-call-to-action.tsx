import * as React from 'react'

import { ICompareBranch, HistoryTabMode } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { Button } from '../lib/button'
import { MergeSouce } from '../../lib/stats/instrumented-event'

interface IMergeCallToActionProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly currentBranch: Branch
  readonly formState: ICompareBranch

  /**
   * Callback to execute after a merge has been performed
   */
  readonly onMerged: () => void
}

export class MergeCallToAction extends React.Component<
  IMergeCallToActionProps,
  {}
> {
  public render() {
    const count = this.props.formState.aheadBehind.behind

    return (
      <div className="merge-cta">
        {this.renderMergeDetails(
          this.props.formState,
          this.props.currentBranch
        )}

        <Button
          type="submit"
          disabled={count <= 0}
          onClick={this.onMergeClicked}
        >
          Merge into <strong>{this.props.currentBranch.name}</strong>
        </Button>
      </div>
    )
  }

  private renderMergeDetails(formState: ICompareBranch, currentBranch: Branch) {
    const branch = formState.comparisonBranch
    const count = formState.aheadBehind.behind

    if (count > 0) {
      const pluralized = count === 1 ? 'commit' : 'commits'
      return (
        <div className="merge-message merge-message-legacy">
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
    }

    return null
  }

  private onMergeClicked = async () => {
    const formState = this.props.formState

    this.props.dispatcher.recordCompareInitiatedMerge()

    await this.props.dispatcher.mergeBranch(
      this.props.repository,
      formState.comparisonBranch.name,
      null,
      MergeSouce.NewCommitsBanner
    )

    this.props.dispatcher.executeCompare(this.props.repository, {
      kind: HistoryTabMode.History,
    })

    this.props.dispatcher.updateCompareForm(this.props.repository, {
      showBranchList: false,
      filterText: '',
    })
    this.props.onMerged()
  }
}
