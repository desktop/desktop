import * as React from 'react'

import { Dispatcher } from '../dispatcher'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'
import { IMatches } from '../../lib/fuzzy-find'
import { truncateWithEllipsis } from '../../lib/truncate-with-ellipsis'
import { DialogHeader } from '../dialog/header'
import { Loading } from '../lib/loading'

interface IRebaseBranchDialogProps {
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

interface IRebaseBranchDialogState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The filter text to use in the branch selector */
  readonly filterText: string

  readonly isRebasing: boolean
}

/** A component for initating a rebase of the current branch. */
export class RebaseBranchDialog extends React.Component<
  IRebaseBranchDialogProps,
  IRebaseBranchDialogState
> {
  public constructor(props: IRebaseBranchDialogProps) {
    super(props)

    const selectedBranch = this.resolveSelectedBranch()

    this.state = {
      selectedBranch,
      filterText: '',
      isRebasing: false,
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    this.setState({ selectedBranch })
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    const selectedBranchIsNotCurrentBranch =
      selectedBranch === null ||
      currentBranch === null ||
      currentBranch.name === selectedBranch.name

    const disabled = selectedBranchIsNotCurrentBranch

    // the amount of characters to allow before we truncate was chosen arbitrarily
    const currentBranchName = truncateWithEllipsis(
      this.props.currentBranch.name,
      40
    )

    const loading = this.state.isRebasing ? <Loading /> : null

    return (
      <Dialog
        id="rebase"
        onDismissed={this.props.onDismissed}
        onSubmit={this.startRebase}
      >
        <DialogHeader
          title={
            <div className="rebase-dialog-header">
              Rebase <strong>{currentBranchName}</strong> onto…
            </div>
          }
          dismissable={true}
          onDismissed={this.props.onDismissed}
        />
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
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {loading}
              Rebase <strong>
                {currentBranch ? currentBranch.name : ''}
              </strong>{' '}
              on <strong>{selectedBranch ? selectedBranch.name : ''}</strong>
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private startRebase = async () => {
    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    this.setState({ isRebasing: true })

    await this.props.dispatcher.rebase(
      this.props.repository,
      branch.name,
      this.props.currentBranch.name
    )

    this.setState({ isRebasing: false })
  }

  /**
   * Returns the branch to use as the selected branch
   *
   * The initial branch is used if passed
   * otherwise, the default branch will be used iff it's
   * not the currently checked out branch
   */
  private resolveSelectedBranch() {
    const { currentBranch, defaultBranch, initialBranch } = this.props

    if (initialBranch !== undefined) {
      return initialBranch
    }

    return currentBranch === defaultBranch ? null : defaultBranch
  }
}
