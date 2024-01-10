import React from 'react'
import { getAheadBehind, revSymmetricDifference } from '../../../lib/git'
import { determineMergeability } from '../../../lib/git/merge-tree'
import { promiseWithMinimumTimeout } from '../../../lib/promise'
import { Branch } from '../../../models/branch'
import { ComputedAction } from '../../../models/computed-action'
import { MergeTreeResult } from '../../../models/merge'
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { PopupType } from '../../../models/popup'
import { ActionStatusIcon } from '../../lib/action-status-icon'
import {
  ChooseBranchDialog,
  IBaseChooseBranchDialogProps,
  resolveSelectedBranch,
} from './base-choose-branch-dialog'
import { truncateWithEllipsis } from '../../../lib/truncate-with-ellipsis'

interface IMergeChooseBranchDialogProp extends IBaseChooseBranchDialogProps {
  /**
   * The branch to select when the rebase dialog is opened
   */
  readonly initialBranch?: Branch
}

interface IMergeChooseBranchDialogState {
  readonly commitCount: number
  readonly mergeStatus: MergeTreeResult | null
  readonly selectedBranch: Branch | null
}

export class MergeChooseBranchDialog extends React.Component<
  IMergeChooseBranchDialogProp,
  IMergeChooseBranchDialogState
> {
  public constructor(props: IMergeChooseBranchDialogProp) {
    super(props)

    const { currentBranch, defaultBranch, initialBranch } = props
    const selectedBranch = resolveSelectedBranch(
      currentBranch,
      defaultBranch,
      initialBranch
    )

    this.state = {
      selectedBranch,
      commitCount: 0,
      mergeStatus: null,
    }
  }

  public componentDidMount() {
    const { selectedBranch } = this.state
    if (selectedBranch !== null) {
      this.updateStatus(selectedBranch)
    }
  }

  protected start = () => {
    if (!this.canStart()) {
      return
    }

    const { selectedBranch } = this.state
    const { operation, dispatcher, repository } = this.props
    if (!selectedBranch) {
      return
    }

    dispatcher.mergeBranch(
      repository,
      selectedBranch,
      this.state.mergeStatus,
      operation === MultiCommitOperationKind.Squash
    )
    this.props.dispatcher.closePopup(PopupType.MultiCommitOperation)
  }

  protected canStart = (): boolean => {
    const currentBranch = this.props.currentBranch
    const { selectedBranch, commitCount, mergeStatus } = this.state

    const selectedBranchIsCurrentBranch =
      selectedBranch !== null &&
      currentBranch !== null &&
      selectedBranch.name === currentBranch.name

    const isBehind = commitCount !== undefined && commitCount > 0

    const canMergeBranch =
      mergeStatus === null || mergeStatus.kind !== ComputedAction.Invalid

    return (
      selectedBranch !== null &&
      !selectedBranchIsCurrentBranch &&
      isBehind &&
      canMergeBranch
    )
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })

    if (selectedBranch === null) {
      this.setState({ commitCount: 0, mergeStatus: null })
      return
    }

    this.updateStatus(selectedBranch)
  }

  private renderActionStatusIcon = () => {
    return (
      <ActionStatusIcon
        status={this.state.mergeStatus}
        classNamePrefix="merge-status"
      />
    )
  }

  private getDialogTitle = () => {
    const truncatedName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40
    )
    const squashPrefix =
      this.props.operation === MultiCommitOperationKind.Squash
        ? 'Squash and '
        : null
    return (
      <>
        {squashPrefix}Merge into <strong>{truncatedName}</strong>
      </>
    )
  }

  private updateStatus = async (branch: Branch) => {
    const { currentBranch, repository } = this.props
    this.setState({
      commitCount: 0,
      mergeStatus: { kind: ComputedAction.Loading },
    })

    const mergeStatus = await promiseWithMinimumTimeout(
      () => determineMergeability(repository, currentBranch, branch),
      500
    ).catch<MergeTreeResult>(e => {
      log.error('Failed determining mergeability', e)
      return { kind: ComputedAction.Clean }
    })

    // The user has selected a different branch since we started, so don't
    // update the preview with stale data.
    if (this.state.selectedBranch !== branch) {
      return
    }

    // The clean status is the only one that needs the ahead/behind count. If
    // the status is conflicts or invalid, update the UI here and end the
    // function.
    if (
      mergeStatus.kind === ComputedAction.Conflicts ||
      mergeStatus.kind === ComputedAction.Invalid
    ) {
      this.setState({ mergeStatus })
      return
    }

    const range = revSymmetricDifference('', branch.name)
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    if (this.state.selectedBranch !== branch) {
      return
    }

    this.setState({ commitCount, mergeStatus })
  }

  private getMergeStatusPreview(): JSX.Element | null {
    const { mergeStatus, selectedBranch: branch } = this.state
    const { currentBranch } = this.props

    if (mergeStatus === null || branch === null) {
      return null
    }

    if (mergeStatus.kind === ComputedAction.Loading) {
      return this.renderLoadingMergeMessage()
    }

    if (mergeStatus.kind === ComputedAction.Clean) {
      return this.renderCleanMergeMessage(
        branch,
        currentBranch,
        this.state.commitCount
      )
    }

    if (mergeStatus.kind === ComputedAction.Invalid) {
      return this.renderInvalidMergeMessage()
    }

    return this.renderConflictedMergeMessage(
      branch,
      currentBranch,
      mergeStatus.conflictedFiles
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

  private renderStatusPreview() {
    return (
      <>
        {this.renderActionStatusIcon()}
        <p className="merge-info" id="merge-status-preview">
          {this.getMergeStatusPreview()}
        </p>
      </>
    )
  }

  public render() {
    return (
      <ChooseBranchDialog
        {...this.props}
        start={this.start}
        selectedBranch={this.state.selectedBranch}
        canStartOperation={this.canStart()}
        dialogTitle={this.getDialogTitle()}
        onSelectionChanged={this.onSelectionChanged}
      >
        {this.renderStatusPreview()}
      </ChooseBranchDialog>
    )
  }
}
