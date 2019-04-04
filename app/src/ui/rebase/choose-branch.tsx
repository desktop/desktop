import * as React from 'react'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { RebasePreview } from '../../models/rebase'
import { ComputedAction } from '../../models/computed-action'
import { CommitOneLine } from '../../models/commit'

import { IMatches } from '../../lib/fuzzy-find'
import { truncateWithEllipsis } from '../../lib/truncate-with-ellipsis'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { ActionStatusIcon } from '../lib/action-status-icon'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'

interface IChooseBranchDialogProps {
  readonly repository: Repository

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch
   */
  readonly currentBranch: Branch

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * The branch to select when the rebase dialog is opened
   */
  readonly initialBranch?: Branch

  /**
   * A preview of the rebase, using the selected base branch to test whether the
   * current branch may be cleanly applied.
   */
  readonly rebasePreviewStatus: RebasePreview | null

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  readonly onBranchChanged: (branch: Branch) => void

  /** Callback to signal to start the rebase */
  readonly onStartRebase: (
    baseBranch: string,
    targetBranch: string,
    commits: ReadonlyArray<CommitOneLine>
  ) => void
}

interface IChooseBranchDialogState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The filter text to use in the branch selector */
  readonly filterText: string
}

/** A component for initating a rebase of the current branch. */
export class ChooseBranchDialog extends React.Component<
  IChooseBranchDialogProps,
  IChooseBranchDialogState
> {
  public constructor(props: IChooseBranchDialogProps) {
    super(props)

    const { initialBranch, currentBranch, defaultBranch } = props

    const selectedBranch = resolveSelectedBranch(
      currentBranch,
      defaultBranch,
      initialBranch
    )

    if (selectedBranch !== null) {
      this.props.onBranchChanged(selectedBranch)
    }

    this.state = {
      selectedBranch,
      filterText: '',
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })

    if (selectedBranch !== null) {
      this.props.onBranchChanged(selectedBranch)
    }
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  public render() {
    const { selectedBranch } = this.state
    const { currentBranch, rebasePreviewStatus } = this.props

    const selectedBranchIsNotCurrentBranch =
      selectedBranch === null ||
      currentBranch === null ||
      currentBranch.name === selectedBranch.name

    const noCommitsToRebase =
      rebasePreviewStatus !== null &&
      rebasePreviewStatus.kind === ComputedAction.Clean
        ? rebasePreviewStatus.commits.length === 0
        : true

    const disabled = selectedBranchIsNotCurrentBranch || noCommitsToRebase

    const currentBranchName = currentBranch.name

    // the amount of characters to allow before we truncate was chosen arbitrarily
    const truncatedCurrentBranchName = truncateWithEllipsis(
      currentBranchName,
      40
    )

    return (
      <Dialog
        id="rebase"
        onDismissed={this.props.onDismissed}
        onSubmit={this.startRebase}
        disabled={disabled}
        dismissable={true}
        title={
          <>
            Rebase <strong>{truncatedCurrentBranchName}</strong> onto…
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
          {this.renderRebaseStatus()}
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              Rebase <strong>{currentBranchName}</strong> onto{' '}
              <strong>{selectedBranch ? selectedBranch.name : ''}</strong>
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderRebaseStatus = () => {
    const { currentBranch, rebasePreviewStatus } = this.props
    const { selectedBranch } = this.state

    if (rebasePreviewStatus === null) {
      return null
    }

    if (selectedBranch === null) {
      return null
    }

    if (currentBranch.name === selectedBranch.name) {
      return null
    }

    return (
      <div className="rebase-status-component">
        <ActionStatusIcon
          status={this.props.rebasePreviewStatus}
          classNamePrefix="rebase-status"
        />
        <p className="rebase-message">
          {this.renderRebaseDetails(
            currentBranch,
            selectedBranch,
            rebasePreviewStatus
          )}
        </p>
      </div>
    )
  }

  private renderRebaseDetails(
    currentBranch: Branch,
    baseBranch: Branch,
    rebaseStatus: RebasePreview
  ): JSX.Element | null {
    if (rebaseStatus.kind === ComputedAction.Loading) {
      return this.renderLoadingRebaseMessage()
    }
    if (rebaseStatus.kind === ComputedAction.Clean) {
      return this.renderCleanRebaseMessage(
        currentBranch,
        baseBranch,
        rebaseStatus.commits.length
      )
    }

    // TODO: other scenarios to display some context about

    return null
  }

  private renderLoadingRebaseMessage() {
    return <>Checking for ability to rebase automatically...</>
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
        This will rebase
        <strong>{` ${commitsToRebase} ${pluralized}`}</strong>
        {` from `}
        <strong>{currentBranch.name}</strong>
        {` onto `}
        <strong>{baseBranch.name}</strong>
      </>
    )
  }

  private startRebase = async () => {
    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    const { rebasePreviewStatus } = this.props

    if (
      rebasePreviewStatus === null ||
      rebasePreviewStatus.kind !== ComputedAction.Clean
    ) {
      return
    }

    this.props.onStartRebase(
      branch.name,
      this.props.currentBranch.name,
      rebasePreviewStatus.commits
    )
  }
}

/**
 * Returns the branch to use as the selected branch in the dialog.
 *
 * The initial branch is used if defined, otherwise the default branch will be
 * compared to the current branch.
 *
 * If the current branch is the default branch, `null` is returned. Otherwise
 * the default branch is used.
 */
function resolveSelectedBranch(
  currentBranch: Branch,
  defaultBranch: Branch | null,
  initialBranch: Branch | undefined
) {
  if (initialBranch !== undefined) {
    return initialBranch
  }

  return currentBranch === defaultBranch ? null : defaultBranch
}
