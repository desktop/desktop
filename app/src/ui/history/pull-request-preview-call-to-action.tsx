import * as React from 'react'

import { HistoryTabMode } from '../../lib/app-state'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Dispatcher } from '../dispatcher'
import { ActionStatusIcon } from '../lib/action-status-icon'
import { MergeTreeResult } from '../../models/merge'
import { ComputedAction } from '../../models/computed-action'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../dropdown-select-button'
import { MultiCommitOperationKind } from '../../models/multi-commit-operation'

const enum PullRequestPreviewCallToActionKind {
  CreatePullRequest = 'CreatePullRequest',
  Merge = 'Merge',
  Squash = 'Squash',
}

interface IPullRequestPreviewCallToActionProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly mergeStatus: MergeTreeResult | null
  readonly currentBranch: Branch
  readonly mergeBaseBranch: Branch
  readonly commitsToMergeCount: number
}

interface IPullRequestPreviewCallToActionState {
  readonly selectedOperation: PullRequestPreviewCallToActionKind
}

export class PullRequestPreviewCallToAction extends React.Component<
  IPullRequestPreviewCallToActionProps,
  IPullRequestPreviewCallToActionState
> {
  public constructor(props: IPullRequestPreviewCallToActionProps) {
    super(props)

    this.state = {
      selectedOperation: PullRequestPreviewCallToActionKind.CreatePullRequest,
    }
  }

  private isUpdateBranchDisabled(): boolean {
    return (
      this.props.commitsToMergeCount <= 0 ||
      (this.props.mergeStatus != null &&
        this.props.mergeStatus.kind === ComputedAction.Invalid)
    )
  }

  private onOperationChange = (option: IDropdownSelectButtonOption) => {
    const value = option.value as PullRequestPreviewCallToActionKind
    this.setState({ selectedOperation: value })
  }

  private onOperationInvoked = async (
    event: React.MouseEvent<HTMLButtonElement>,
    selectedOption: IDropdownSelectButtonOption
  ) => {
    event.preventDefault()

    const { dispatcher, repository } = this.props

    await this.dispatchOperation(
      selectedOption.value as PullRequestPreviewCallToActionKind
    )

    dispatcher.updateCompareForm(repository, {
      showBranchList: false,
      filterText: '',
    })

    dispatcher.executeCompare(repository, {
      kind: HistoryTabMode.History,
    })
  }

  private async dispatchOperation(
    operation: PullRequestPreviewCallToActionKind
  ): Promise<void> {
    const {
      dispatcher,
      currentBranch,
      mergeBaseBranch,
      repository,
      mergeStatus,
    } = this.props

    if (operation === PullRequestPreviewCallToActionKind.CreatePullRequest) {
      return dispatcher.createPullRequest(repository)
    }

    const isSquash = operation === PullRequestPreviewCallToActionKind.Squash
    dispatcher.initializeMultiCommitOperation(
      repository,
      {
        kind: MultiCommitOperationKind.Merge,
        isSquash,
        sourceBranch: currentBranch,
      },
      mergeBaseBranch,
      [],
      currentBranch.tip.sha
    )
    dispatcher.recordCompareInitiatedMerge()

    return dispatcher.mergeBranch(
      repository,
      currentBranch,
      mergeStatus,
      isSquash,
      mergeBaseBranch
    )
  }

  private getMergeOptions = () => {
    return [
      {
        label: 'Create a Pull Request',
        description: `The current branch (${this.props.currentBranch.name}) is already published to GitHub. Create a pull request to propose and collaborate on your changes.`,
        value: PullRequestPreviewCallToActionKind.CreatePullRequest,
      },
      {
        label: 'Create a merge commit',
        description: `The commits from the current branch (${this.props.currentBranch.name}) will be added to the compared branch (${this.props.mergeBaseBranch.name}) via a merge commit.`,
        value: PullRequestPreviewCallToActionKind.Merge,
      },
      {
        label: 'Squash and merge',
        description: `The commits in the current branch (${this.props.currentBranch.name}) will be combined into one commit and added the compared branch (${this.props.mergeBaseBranch.name}).`,
        value: PullRequestPreviewCallToActionKind.Squash,
      },
    ]
  }

  public render() {
    const disabled = this.isUpdateBranchDisabled()
    const mergeDetails =
      this.props.commitsToMergeCount > 0 ? this.renderMergeStatus() : null

    return (
      <div className="merge-cta">
        {mergeDetails}

        <DropdownSelectButton
          selectedValue={this.state.selectedOperation}
          options={this.getMergeOptions()}
          disabled={disabled}
          onSelectChange={this.onOperationChange}
          onSubmit={this.onOperationInvoked}
        />
      </div>
    )
  }

  private renderMergeStatus() {
    if (this.props.mergeStatus === null) {
      return null
    }

    return (
      <div className="merge-status-component">
        <ActionStatusIcon
          status={{ kind: this.props.mergeStatus.kind }}
          classNamePrefix="merge-status"
        />

        {this.renderStatusDetails()}
      </div>
    )
  }

  private renderStatusDetails() {
    const { mergeStatus } = this.props

    if (mergeStatus === null) {
      return null
    }

    switch (mergeStatus.kind) {
      case ComputedAction.Loading:
        return this.renderLoadingMessage()
      case ComputedAction.Clean:
        return this.renderCleanMessage()
      case ComputedAction.Invalid:
        return this.renderInvalidMessage()
      case ComputedAction.Conflicts:
        return this.renderConflictedMergeMessage(mergeStatus.conflictedFiles)
    }
  }

  private renderLoadingMessage() {
    return (
      <div className="merge-message merge-message-loading">
        Checking for ability to merge…
      </div>
    )
  }

  private renderCleanMessage() {
    const { commitsToMergeCount, currentBranch, mergeBaseBranch } = this.props
    const { selectedOperation } = this.state
    if (
      commitsToMergeCount <= 0 ||
      selectedOperation === PullRequestPreviewCallToActionKind.CreatePullRequest
    ) {
      return null
    }

    const pluralized = commitsToMergeCount === 1 ? 'commit' : 'commits'

    return (
      <div className="merge-message">
        This will {selectedOperation.toLowerCase()}
        <strong>{` ${commitsToMergeCount} ${pluralized}`}</strong>
        {` from `}
        <strong>{currentBranch.name}</strong>
        {` into `}
        <strong>{mergeBaseBranch.name}</strong>
      </div>
    )
  }

  private renderInvalidMessage() {
    return (
      <div className="merge-message">
        Unable to merge unrelated histories in this repository
      </div>
    )
  }

  private renderConflictedMergeMessage(count: number) {
    const { currentBranch, mergeBaseBranch } = this.props
    const pluralized = count === 1 ? 'file' : 'files'
    return (
      <div className="merge-message">
        There will be
        <strong>{` ${count} conflicted ${pluralized}`}</strong>
        {` when merging `}
        <strong>{currentBranch.name}</strong>
        {` into `}
        <strong>{mergeBaseBranch.name}</strong>
      </div>
    )
  }
}
