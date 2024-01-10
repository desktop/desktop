import React from 'react'
import { Branch } from '../../../models/branch'
import { ComputedAction } from '../../../models/computed-action'
import { RebasePreview } from '../../../models/rebase'
import { ActionStatusIcon } from '../../lib/action-status-icon'
import { updateRebasePreview } from '../../lib/update-branch'
import {
  ChooseBranchDialog,
  IBaseChooseBranchDialogProps,
  resolveSelectedBranch,
} from './base-choose-branch-dialog'
import { truncateWithEllipsis } from '../../../lib/truncate-with-ellipsis'

interface IRebaseChooseBranchDialogProp extends IBaseChooseBranchDialogProps {
  /**
   * The branch to select when the rebase dialog is opened
   */
  readonly initialBranch?: Branch
}

interface IRebaseChooseBranchDialogState {
  readonly rebasePreview: RebasePreview | null
  readonly selectedBranch: Branch | null
}

export class RebaseChooseBranchDialog extends React.Component<
  IRebaseChooseBranchDialogProp,
  IRebaseChooseBranchDialogState
> {
  public constructor(props: IRebaseChooseBranchDialogProp) {
    super(props)

    const { currentBranch, defaultBranch, initialBranch } = props
    const selectedBranch = resolveSelectedBranch(
      currentBranch,
      defaultBranch,
      initialBranch
    )

    this.state = {
      selectedBranch,
      rebasePreview: null,
    }
  }

  public componentDidMount() {
    const { selectedBranch } = this.state
    if (selectedBranch !== null) {
      this.updateStatus(selectedBranch)
    }
  }

  protected start = () => {
    const { selectedBranch, rebasePreview } = this.state
    const { repository, currentBranch } = this.props
    if (!selectedBranch) {
      return
    }

    if (rebasePreview === null || rebasePreview.kind !== ComputedAction.Clean) {
      return
    }

    if (!this.canStart()) {
      return
    }

    this.props.dispatcher.startRebase(
      repository,
      selectedBranch,
      currentBranch,
      rebasePreview.commits
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
    const { rebasePreview } = this.state
    return rebasePreview !== null && rebasePreview.kind === ComputedAction.Clean
      ? rebasePreview.commits.length > 0
      : false
  }

  protected getSubmitButtonToolTip = () => {
    return this.selectedBranchIsCurrentBranch()
      ? 'You are not able to rebase this branch onto itself'
      : !this.selectedBranchIsAheadOfCurrentBranch()
      ? 'There are no commits on the current branch to rebase'
      : undefined
  }

  protected getDialogTitle = () => {
    const truncatedName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40
    )
    return (
      <>
        Rebase <strong>{truncatedName}</strong>
      </>
    )
  }

  protected renderActionStatusIcon = () => {
    const { rebasePreview } = this.state
    return (
      <ActionStatusIcon status={rebasePreview} classNamePrefix="merge-status" />
    )
  }

  protected updateStatus = async (baseBranch: Branch) => {
    const { currentBranch: targetBranch, repository } = this.props
    updateRebasePreview(baseBranch, targetBranch, repository, rebasePreview => {
      this.setState({ rebasePreview })
    })
  }

  private getRebaseStatusPreview(): JSX.Element | null {
    const { rebasePreview, selectedBranch: baseBranch } = this.state
    if (rebasePreview == null || baseBranch == null) {
      return null
    }

    const { currentBranch } = this.props

    if (rebasePreview.kind === ComputedAction.Loading) {
      return this.renderLoadingRebaseMessage()
    }
    if (rebasePreview.kind === ComputedAction.Clean) {
      return this.renderCleanRebaseMessage(
        currentBranch,
        baseBranch,
        rebasePreview.commits.length
      )
    }

    if (rebasePreview.kind === ComputedAction.Invalid) {
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

  private renderStatusPreview() {
    return (
      <>
        {this.renderActionStatusIcon()}
        <p className="merge-info" id="merge-status-preview">
          {this.getRebaseStatusPreview()}
        </p>
      </>
    )
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })

    if (selectedBranch === null) {
      this.setState({ rebasePreview: null })
      return
    }

    this.updateStatus(selectedBranch)
  }

  public render() {
    return (
      <ChooseBranchDialog
        {...this.props}
        start={this.start}
        selectedBranch={this.state.selectedBranch}
        canStartOperation={this.canStart()}
        dialogTitle={this.getDialogTitle()}
        submitButtonTooltip={this.getSubmitButtonToolTip()}
        onSelectionChanged={this.onSelectionChanged}
      >
        {this.renderStatusPreview()}
      </ChooseBranchDialog>
    )
  }
}
