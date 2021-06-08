import React from 'react'
import { getCommitsBetweenCommits, getMergeBase } from '../../../lib/git'
import { promiseWithMinimumTimeout } from '../../../lib/promise'
import { Branch } from '../../../models/branch'
import { ComputedAction } from '../../../models/computed-action'
import { RebasePreview } from '../../../models/rebase'
import { ActionStatusIcon } from '../../lib/action-status-icon'
import { BaseChooseBranchDialog } from './base-choose-branch-dialog'

export abstract class RebaseChooseBranchDialog extends BaseChooseBranchDialog {
  private rebasePreview: RebasePreview | null = null

  protected start = () => {
    const { selectedBranch } = this.state
    const { repository, currentBranch } = this.props
    if (!selectedBranch) {
      return
    }

    if (
      this.rebasePreview === null ||
      this.rebasePreview.kind !== ComputedAction.Clean
    ) {
      return
    }

    if (!this.canStart()) {
      return
    }

    this.props.dispatcher.startRebase(
      repository,
      selectedBranch,
      currentBranch,
      this.rebasePreview.commits
    )
  }

  protected canStart = (): boolean => {
    return (
      this.state.selectedBranch !== null &&
      !this.selectedBranchIsCurrentBranch() &&
      this.selectedBranchIsAheadOfCurrentBranch()
    )
  }

  private selectedBranchIsCurrentBranch() {
    const currentBranch = this.props.currentBranch
    const { selectedBranch } = this.state
    return (
      selectedBranch !== null &&
      currentBranch !== null &&
      selectedBranch.name === currentBranch.name
    )
  }

  private selectedBranchIsAheadOfCurrentBranch() {
    return this.rebasePreview !== null &&
      this.rebasePreview.kind === ComputedAction.Clean
      ? this.rebasePreview.commits.length > 0
      : false
  }

  protected getSubmitButtonToolTip = () => {
    return this.selectedBranchIsCurrentBranch()
      ? 'You are not able to rebase this branch onto itself'
      : !this.selectedBranchIsAheadOfCurrentBranch()
      ? 'There are no commits on the current branch to rebase'
      : undefined
  }

  protected getDialogTitle = (branchName: string) => {
    return (
      <>
        Rebase <strong>{branchName}</strong>
      </>
    )
  }

  protected renderActionStatusIcon = () => {
    return (
      <ActionStatusIcon
        status={this.rebasePreview}
        classNamePrefix="merge-status"
      />
    )
  }

  protected updateStatus = async (baseBranch: Branch) => {
    const { currentBranch: targetBranch, repository } = this.props
    const computingRebaseForBranch = baseBranch.name

    this.rebasePreview = {
      kind: ComputedAction.Loading,
    }
    this.updateRebaseStatusPreview(baseBranch)

    const { commits, base } = await promiseWithMinimumTimeout(async () => {
      const commits = await getCommitsBetweenCommits(
        repository,
        baseBranch.tip.sha,
        targetBranch.tip.sha
      )

      const base = await getMergeBase(
        repository,
        baseBranch.tip.sha,
        targetBranch.tip.sha
      )

      return { commits, base }
    }, 500)

    // if the branch being track has changed since we started this work, abandon
    // any further state updates (this function is re-entrant if the user is
    // using the keyboard to quickly switch branches)
    if (computingRebaseForBranch !== baseBranch.name) {
      this.rebasePreview = null
      this.updateRebaseStatusPreview(baseBranch)
      return
    }

    // if we are unable to find any commits to rebase, indicate that we're
    // unable to proceed with the rebase
    if (commits === null) {
      this.rebasePreview = {
        kind: ComputedAction.Invalid,
      }
      this.updateRebaseStatusPreview(baseBranch)
      return
    }

    // the target branch is a direct descendant of the base branch
    // which means the target branch is already up to date and the commits
    // do not need to be applied
    const isDirectDescendant = base === baseBranch.tip.sha
    const commitsOrIgnore = isDirectDescendant ? [] : commits

    this.rebasePreview = {
      kind: ComputedAction.Clean,
      commits: commitsOrIgnore,
    }
    this.updateRebaseStatusPreview(baseBranch)
  }

  private updateRebaseStatusPreview(baseBranch: Branch) {
    this.setState({ statusPreview: this.getRebaseStatusPreview(baseBranch) })
  }

  private getRebaseStatusPreview(baseBranch: Branch): JSX.Element | null {
    if (this.rebasePreview == null) {
      return null
    }

    const { currentBranch } = this.props

    if (this.rebasePreview.kind === ComputedAction.Loading) {
      return this.renderLoadingRebaseMessage()
    }
    if (this.rebasePreview.kind === ComputedAction.Clean) {
      return this.renderCleanRebaseMessage(
        currentBranch,
        baseBranch,
        this.rebasePreview.commits.length
      )
    }

    if (this.rebasePreview.kind === ComputedAction.Invalid) {
      return this.renderInvalidRebaseMessage()
    }

    return null
  }

  private renderLoadingRebaseMessage() {
    return <>Checking for ability to rebase automatically…</>
  }

  private renderInvalidRebaseMessage() {
    return <>Unable to start rebase. Check you have chosen a valid branch.</>
  }

  private renderCleanRebaseMessage(
    currentBranch: Branch,
    baseBranch: Branch,
    commitsToRebase: number
  ) {
    if (commitsToRebase <= 0) {
      return (
        <>
          This branch is up to date with{` `}
          <strong>{currentBranch.name}</strong>
        </>
      )
    }

    const pluralized = commitsToRebase === 1 ? 'commit' : 'commits'
    return (
      <>
        This will update <strong>{currentBranch.name}</strong>
        {` by applying its `}
        <strong>{` ${commitsToRebase} ${pluralized}`}</strong>
        {` on top of `}
        <strong>{baseBranch.name}</strong>
      </>
    )
  }
}
