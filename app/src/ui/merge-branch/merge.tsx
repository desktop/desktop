import * as React from 'react'

import { getAheadBehind, mergeTree } from '../../lib/git'
import { Dispatcher } from '../dispatcher'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'
import { revSymmetricDifference } from '../../lib/git'
import { IMatches } from '../../lib/fuzzy-find'
import { MergePreview } from '../../models/merge'
import { ComputedAction } from '../../models/computed-action'
import { ActionStatusIcon } from '../lib/action-status-icon'
import { promiseWithMinimumTimeout } from '../../lib/promise'
import { truncateWithEllipsis } from '../../lib/truncate-with-ellipsis'

interface IMergeProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /**
   * See `IBranchesState.defaultBranch`
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch

  /** Is a merge of selected branch into the current branch valid and clean? */
  readonly mergePreview: MergePreview | null

  /**
   * See `IBranchesState.allBranches`
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See `IBranchesState.recentBranches`
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The branch to select when the merge dialog is opened
   */
  readonly initialBranch?: Branch

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface IMergeState {
  /** The filter text to use in the branch selector */
  readonly filterText: string
}

/** A component for merging a branch into the current branch. */
export class Merge extends React.Component<IMergeProps, IMergeState> {
  public constructor(props: IMergeProps) {
    super(props)

    this.state = {
      filterText: '',
    }
  }

  public componentDidMount() {
    const branch = resolveSelectedBranch(this.props)
    if (!branch) {
      return
    }

    this.updateMergeStatus(branch)
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = async (selectedBranch: Branch | null) => {
    if (selectedBranch !== null) {
      await this.updateMergeStatus(selectedBranch)
    }
  }

  private renderMergeInfo() {
    const { currentBranch, mergePreview } = this.props
    const selectedBranch = resolveSelectedBranch(this.props)

    if (
      mergePreview == null ||
      currentBranch == null ||
      selectedBranch == null ||
      currentBranch.name === selectedBranch.name
    ) {
      return null
    }

    return (
      <div className="merge-status-component">
        <ActionStatusIcon
          status={this.props.mergePreview}
          classNamePrefix="merge-status"
        />
        <p className="merge-info">
          {this.renderMergeStatusMessage(
            mergePreview,
            selectedBranch,
            currentBranch
          )}
        </p>
      </div>
    )
  }

  private renderMergeStatusMessage(
    mergePreview: MergePreview,
    branch: Branch,
    currentBranch: Branch
  ): JSX.Element {
    if (mergePreview.kind === ComputedAction.Loading) {
      return this.renderLoadingMergeMessage()
    }
    if (mergePreview.kind === ComputedAction.Invalid) {
      return this.renderInvalidMergeMessage()
    }

    const commitCount = mergePreview.commits.length

    if (mergePreview.kind === ComputedAction.Clean) {
      return this.renderCleanMergeMessage(branch, currentBranch, commitCount)
    }

    return this.renderConflictedMergeMessage(
      branch,
      currentBranch,
      commitCount,
      mergePreview.conflictedFiles
    )
  }

  private renderLoadingMergeMessage() {
    return <>Checking for ability to merge automatically...</>
  }

  private renderCleanMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    commitCount: number
  ) {
    if (commitCount === 0) {
      return (
        <>
          {`This branch is up to date with `}
          <strong>{branch.name}</strong>
        </>
      )
    }

    const pluralized = commitCount === 1 ? 'commit' : 'commits'
    return (
      <>
        This will merge
        <strong>{` ${commitCount} ${pluralized}`}</strong>
        {` from `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </>
    )
  }

  private renderInvalidMergeMessage() {
    return <>Unable to merge unrelated histories in this repository</>
  }

  private renderConflictedMergeMessage(
    branch: Branch,
    currentBranch: Branch,
    commitCount: number,
    fileCount: number
  ) {
    const pluralizedFile = fileCount === 1 ? 'file' : 'files'
    const pluralizedCommit = commitCount === 1 ? 'commit' : 'commits'
    return (
      <>
        There will be
        <strong>{` ${fileCount} conflicted ${pluralizedFile}`}</strong>
        {` when merging `}
        <strong>{` ${commitCount} ${pluralizedCommit}`}</strong>
        {` from `}
        <strong>{branch.name}</strong>
        {` into `}
        <strong>{currentBranch.name}</strong>
      </>
    )
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  public render() {
    const selectedBranch = resolveSelectedBranch(this.props)
    const currentBranch = this.props.currentBranch

    const selectedBranchIsNotCurrentBranch =
      selectedBranch === null || currentBranch.name === selectedBranch.name

    const cannotMergeBranch =
      this.props.mergePreview !== null &&
      this.props.mergePreview.kind === ComputedAction.Invalid

    const invalidBranchState =
      this.props.mergePreview !== null &&
      this.props.mergePreview.kind === ComputedAction.Clean &&
      this.props.mergePreview.commits.length === 0

    const disabled =
      selectedBranchIsNotCurrentBranch ||
      invalidBranchState ||
      cannotMergeBranch

    // the amount of characters to allow before we truncate was chosen arbitrarily
    const currentBranchName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40
    )
    return (
      <Dialog
        id="merge"
        onDismissed={this.props.onDismissed}
        onSubmit={this.merge}
        title={
          <>
            Merge into <strong>{currentBranchName}</strong>
          </>
        }
      >
        <DialogContent>
          <BranchList
            allBranches={this.props.allBranches}
            currentBranch={currentBranch}
            defaultBranch={this.props.defaultBranch}
            recentBranches={this.props.recentBranches}
            filterText={this.state.filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            selectedBranch={selectedBranch}
            onSelectionChanged={this.onSelectionChanged}
            canCreateNewBranch={false}
            renderBranch={this.renderBranch}
          />
        </DialogContent>
        <DialogFooter>
          {this.renderMergeInfo()}
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              Merge <strong>{selectedBranch ? selectedBranch.name : ''}</strong>{' '}
              into <strong>{currentBranch ? currentBranch.name : ''}</strong>
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private async updateMergeStatus(branch: Branch) {}

  private merge = () => {
    const branch = resolveSelectedBranch(this.props)
    if (!branch) {
      return
    }

    this.props.dispatcher.mergeBranch(
      this.props.repository,
      branch.name,
      this.props.mergePreview
    )
    this.props.dispatcher.closePopup()
  }
}

/**
 * Returns the branch to use as the currently selected branch
 */
function resolveSelectedBranch({
  mergePreview,
  currentBranch,
  defaultBranch,
  initialBranch,
}: {
  readonly mergePreview: MergePreview | null
  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch
  readonly initialBranch?: Branch
}): Branch | null {
  if (mergePreview !== null) {
    return mergePreview.headBranch
  }
  if (initialBranch !== undefined) {
    return initialBranch
  }

  return currentBranch === defaultBranch ? null : defaultBranch
}
