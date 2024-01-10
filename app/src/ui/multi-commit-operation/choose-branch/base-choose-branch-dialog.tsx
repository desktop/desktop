import * as React from 'react'
import { Branch } from '../../../models/branch'
import { Repository } from '../../../models/repository'
import { IMatches } from '../../../lib/fuzzy-find'
import { Dialog, DialogContent, DialogFooter } from '../../dialog'
import {
  BranchList,
  IBranchListItem,
  renderDefaultBranch,
} from '../../branches'
import { Dispatcher } from '../../dispatcher'
import { ClickSource } from '../../lib/list'
import {
  DropdownSelectButton,
  IDropdownSelectButtonOption,
} from '../../dropdown-select-button'
import {
  MultiCommitOperationKind,
  isIdMultiCommitOperation,
} from '../../../models/multi-commit-operation'
import { assertNever } from '../../../lib/fatal-error'
import { getMergeOptions } from '../../lib/update-branch'
import { getDefaultAriaLabelForBranch } from '../../branches/branch-renderer'

/**
 * Returns the branch to use as the selected branch in the dialog.
 *
 * The initial branch is used if defined, otherwise the default branch will be
 * compared to the current branch.
 *
 * If the current branch is the default branch, `null` is returned. Otherwise
 * the default branch is used.
 */
export function resolveSelectedBranch(
  currentBranch: Branch,
  defaultBranch: Branch | null,
  initialBranch?: Branch
): Branch | null {
  if (initialBranch !== undefined) {
    return initialBranch
  }

  return currentBranch === defaultBranch ? null : defaultBranch
}

export interface IBaseChooseBranchDialogProps {
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
   * Type of operation (Merge, Squash, Rebase)
   */
  readonly operation: MultiCommitOperationKind

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

export interface IChooseBranchDialogProps extends IBaseChooseBranchDialogProps {
  readonly selectedBranch: Branch | null
  readonly dialogTitle: string | JSX.Element | undefined
  readonly submitButtonTooltip?: string
  readonly canStartOperation: boolean
  readonly start: () => void
  readonly onSelectionChanged: (selectedBranch: Branch | null) => void
}

export interface IChooseBranchDialogState {
  /** The filter text to use in the branch selector */
  readonly filterText: string
}

export abstract class ChooseBranchDialog extends React.Component<
  IChooseBranchDialogProps,
  IChooseBranchDialogState
> {
  public constructor(props: IChooseBranchDialogProps) {
    super(props)

    this.state = {
      filterText: '',
    }
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onItemClick = (branch: Branch, source: ClickSource) => {
    if (source.kind !== 'keyboard' || source.event.key !== 'Enter') {
      return
    }

    source.event.preventDefault()

    const { selectedBranch } = this.props
    if (selectedBranch !== null && selectedBranch.name === branch.name) {
      this.props.start()
    }
  }

  protected onSelectionChanged = (selectedBranch: Branch | null) => {
    this.props.onSelectionChanged(selectedBranch)
  }

  private onOperationChange = (option: IDropdownSelectButtonOption) => {
    if (!isIdMultiCommitOperation(option.id)) {
      return
    }

    const { dispatcher, repository } = this.props
    const { selectedBranch } = this.props
    switch (option.id) {
      case MultiCommitOperationKind.Merge:
        dispatcher.startMergeBranchOperation(repository, false, selectedBranch)
        break
      case MultiCommitOperationKind.Squash:
        dispatcher.startMergeBranchOperation(repository, true, selectedBranch)
        break
      case MultiCommitOperationKind.Rebase:
        dispatcher.showRebaseDialog(repository, selectedBranch)
        break
      case MultiCommitOperationKind.CherryPick:
      case MultiCommitOperationKind.Reorder:
        break
      default:
        assertNever(option.id, `Unknown operation value: ${option.id}`)
    }
  }

  private renderStatusPreview() {
    const { currentBranch, selectedBranch, children } = this.props

    if (selectedBranch == null || currentBranch.name === selectedBranch.name) {
      return null
    }

    return <div className="merge-status-component">{children}</div>
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  private getBranchAriaLabel = (item: IBranchListItem): string => {
    return getDefaultAriaLabelForBranch(item)
  }

  public render() {
    const {
      selectedBranch,
      currentBranch,
      operation,
      dialogTitle,
      canStartOperation,
      submitButtonTooltip,
      start,
    } = this.props

    return (
      <Dialog
        id="choose-branch"
        onDismissed={this.props.onDismissed}
        onSubmit={start}
        dismissable={true}
        title={dialogTitle}
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
            getBranchAriaLabel={this.getBranchAriaLabel}
            onItemClick={this.onItemClick}
          />
        </DialogContent>
        <DialogFooter>
          {this.renderStatusPreview()}
          <DropdownSelectButton
            checkedOption={operation}
            options={getMergeOptions()}
            disabled={!canStartOperation}
            ariaDescribedBy="merge-status-preview"
            dropdownAriaLabel="Merge options"
            tooltip={submitButtonTooltip}
            onCheckedOptionChange={this.onOperationChange}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
