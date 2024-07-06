import * as React from 'react'
import { Branch } from '../../../models/branch'
import { IMatches } from '../../../lib/fuzzy-find'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../../dialog'
import {
  BranchList,
  IBranchListItem,
  renderDefaultBranch,
} from '../../branches'
import { ClickSource } from '../../lib/list'
import { getDefaultAriaLabelForBranch } from '../../branches/branch-renderer'

interface IChooseTargetBranchDialogProps {
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
   * Number of commits to cherry pick
   */
  readonly commitCount: number

  /**
   * A function that's called when the user selects a branch and hits start
   * cherry pick
   */
  readonly onCherryPick: (targetBranch: Branch) => void

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * Call back to invoke create new branch dialog
   */
  readonly onCreateNewBranch: (targetBranchName: string) => void
}

interface IChooseTargetBranchDialogState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The filter text to use in the branch selector */
  readonly filterText: string

  /** When there are no branches to show, prompt for create branch */
  readonly isCreateBranchState: boolean
}

/** A component for initiating a rebase of the current branch. */
export class ChooseTargetBranchDialog extends React.Component<
  IChooseTargetBranchDialogProps,
  IChooseTargetBranchDialogState
> {
  public constructor(props: IChooseTargetBranchDialogProps) {
    super(props)

    this.state = {
      selectedBranch: null,
      filterText: '',
      isCreateBranchState: props.allBranches.length === 0,
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

  private getBranchAriaLabel = (item: IBranchListItem): string => {
    return getDefaultAriaLabelForBranch(item)
  }

  private onEnterPressed = (branch: Branch, source: ClickSource) => {
    if (source.kind !== 'keyboard' || source.event.key !== 'Enter') {
      return
    }

    source.event.preventDefault()

    const { selectedBranch } = this.state
    if (selectedBranch !== null && selectedBranch.name === branch.name) {
      this.startCherryPick()
    }
  }

  private canCherryPickOntoSelectedBranch() {
    const { selectedBranch, isCreateBranchState } = this.state
    return (
      (selectedBranch !== null && !this.selectedBranchIsCurrentBranch()) ||
      isCreateBranchState
    )
  }

  private selectedBranchIsCurrentBranch() {
    const { selectedBranch } = this.state
    const currentBranch = this.props.currentBranch
    return (
      selectedBranch !== null &&
      currentBranch !== null &&
      selectedBranch.name === currentBranch.name
    )
  }

  private renderOkButtonText() {
    const { selectedBranch, isCreateBranchState } = this.state

    if (isCreateBranchState) {
      return __DARWIN__
        ? 'Cherry-pick to New Branch'
        : 'Cherry-pick to new branch'
    }

    const pluralize = this.props.commitCount > 1 ? 'commits' : 'commit'
    const okButtonText = `Cherry-pick ${this.props.commitCount} ${pluralize}`

    if (selectedBranch !== null) {
      return (
        <>
          {okButtonText} to <strong>{selectedBranch.name}</strong>…
        </>
      )
    }

    return okButtonText
  }

  private onFilterListResultsChanged = (resultCount: number) => {
    const { isCreateBranchState } = this.state
    if (resultCount === 0 && !isCreateBranchState) {
      this.setState({ isCreateBranchState: true })
    } else if (resultCount > 0 && isCreateBranchState) {
      this.setState({ isCreateBranchState: false })
    }
  }

  public render() {
    const tooltip = this.selectedBranchIsCurrentBranch()
      ? 'You are not able to cherry-pick from and to the same branch'
      : undefined

    const pluralize = this.props.commitCount > 1 ? 'commits' : 'commit'
    return (
      <Dialog
        id="cherry-pick"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        title={
          <strong>
            Cherry-pick {this.props.commitCount} {pluralize} to a branch
          </strong>
        }
      >
        <DialogContent>
          <BranchList
            allBranches={this.props.allBranches}
            currentBranch={this.props.currentBranch}
            defaultBranch={this.props.defaultBranch}
            recentBranches={this.props.recentBranches}
            filterText={this.state.filterText}
            onFilterTextChanged={this.onFilterTextChanged}
            onFilterListResultsChanged={this.onFilterListResultsChanged}
            selectedBranch={this.state.selectedBranch}
            onSelectionChanged={this.onSelectionChanged}
            canCreateNewBranch={true}
            onCreateNewBranch={this.props.onCreateNewBranch}
            renderBranch={this.renderBranch}
            getBranchAriaLabel={this.getBranchAriaLabel}
            onItemClick={this.onEnterPressed}
          />
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={this.renderOkButtonText()}
            okButtonDisabled={!this.canCherryPickOntoSelectedBranch()}
            okButtonTitle={tooltip}
            cancelButtonVisible={false}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { isCreateBranchState, filterText } = this.state
    if (isCreateBranchState) {
      this.props.onCreateNewBranch(filterText)
      return
    }

    this.startCherryPick()
  }

  private startCherryPick = async () => {
    const { selectedBranch } = this.state

    if (selectedBranch === null || !this.canCherryPickOntoSelectedBranch()) {
      return
    }

    this.props.onCherryPick(selectedBranch)
  }
}
