import * as React from 'react'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { RebasePreview } from '../../models/rebase'
import { ComputedAction } from '../../models/computed-action'

import { IMatches } from '../../lib/fuzzy-find'
import { truncateWithEllipsis } from '../../lib/truncate-with-ellipsis'
import { getCommitsInRange, getMergeBase } from '../../lib/git'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { ActionStatusIcon } from '../lib/action-status-icon'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'
import { Dispatcher } from '../dispatcher'

interface IChooseBranchDialogProps {
  readonly dispatcher: Dispatcher

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
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface IChooseBranchDialogState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /**
   * A preview of the rebase, using the selected base branch to test whether the
   * current branch will be cleanly applied.
   */
  readonly rebasePreview: RebasePreview | null

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
      this.onBranchChanged(selectedBranch)
    }

    this.state = {
      selectedBranch,
      rebasePreview: null,
      filterText: '',
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onBranchChanged = async (selectedBranch: Branch) => {
    const { currentBranch } = this.props

    await this.updateRebaseStatus(selectedBranch, currentBranch)
  }

  private async updateRebaseStatus(baseBranch: Branch, targetBranch: Branch) {
    const { repository } = this.props
    this.setState({
      rebasePreview: {
        kind: ComputedAction.Loading,
      },
    })

    const commits = await getCommitsInRange(
      this.props.repository,
      baseBranch.tip.sha,
      targetBranch.tip.sha
    )

    // TODO: in what situations might this not be possible to compute?

    const base = await getMergeBase(
      repository,
      baseBranch.tip.sha,
      targetBranch.tip.sha
    )

    if (base === baseBranch.tip.sha) {
      // the target branch is a direct descendant of the base branch
      // which means the target branch is already up to date
      this.setState({
        rebasePreview: {
          kind: ComputedAction.Clean,
          commits: [],
        },
      })
    } else {
      this.setState({
        rebasePreview: {
          kind: ComputedAction.Clean,
          commits,
        },
      })
    }

    // TODO: generate the patches associated with these commits and see if
    //       they will apply to the base branch - if it fails, there will be
    //       conflicts to come
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })

    if (selectedBranch !== null) {
      this.onBranchChanged(selectedBranch)
    }
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  public render() {
    const { selectedBranch, rebasePreview } = this.state
    const { currentBranch } = this.props

    const selectedBranchIsNotCurrentBranch =
      selectedBranch === null ||
      currentBranch === null ||
      currentBranch.name === selectedBranch.name

    const noCommitsToRebase =
      rebasePreview !== null && rebasePreview.kind === ComputedAction.Clean
        ? rebasePreview.commits.length === 0
        : true

    const disabled = selectedBranchIsNotCurrentBranch || noCommitsToRebase

    const tooltip = selectedBranchIsNotCurrentBranch
      ? 'You are not able to rebase this branch onto itself'
      : noCommitsToRebase
      ? 'There are no commits on the current branch to rebase'
      : undefined

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
        dismissable={true}
        title={
          <>
            Rebase <strong>{truncatedCurrentBranchName}</strong>…
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
            <Button type="submit" disabled={disabled} tooltip={tooltip}>
              Start rebase
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private renderRebaseStatus = () => {
    const { currentBranch } = this.props
    const { selectedBranch, rebasePreview } = this.state

    if (rebasePreview === null) {
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
          status={rebasePreview}
          classNamePrefix="rebase-status"
        />
        <p className="rebase-message">
          {this.renderRebaseDetails(
            currentBranch,
            selectedBranch,
            rebasePreview
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
        This will update <strong>{currentBranch.name}</strong>
        {` by applying its `}
        <strong>{` ${commitsToRebase} ${pluralized}`}</strong>
        {` on top of `}
        <strong>{baseBranch.name}</strong>
      </>
    )
  }

  private startRebase = async () => {
    const { selectedBranch, rebasePreview } = this.state
    const { repository, currentBranch } = this.props
    if (!selectedBranch) {
      return
    }

    if (rebasePreview === null || rebasePreview.kind !== ComputedAction.Clean) {
      return
    }

    this.props.dispatcher.startRebase(
      repository,
      selectedBranch,
      currentBranch,
      rebasePreview.commits
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
