import * as React from 'react'
import { Branch } from '../../../models/branch'
import { Repository } from '../../../models/repository'
import { IMatches } from '../../../lib/fuzzy-find'
import { truncateWithEllipsis } from '../../../lib/truncate-with-ellipsis'
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
import { MultiCommitOperationKind } from '../../../models/multi-commit-operation'
import { assertNever } from '../../../lib/fatal-error'

interface IBaseChooseBranchDialogProps {
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
   * Type of operation (Merge, Squash, Rebase)
   */
  readonly operation: MultiCommitOperationKind

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

export interface IBaseChooseBranchDialogState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The filter text to use in the branch selector */
  readonly filterText: string

  /**
   * A preview of the operation using the selected base branch to test whether the
   * current branch will be cleanly applied.
   */
  readonly statusPreview: JSX.Element | null
}

export abstract class BaseChooseBranchDialog extends React.Component<
  IBaseChooseBranchDialogProps,
  IBaseChooseBranchDialogState
> {
  protected abstract start = () => {}

  protected abstract canStart = (): boolean => {
    return false
  }

  protected abstract updateStatus = async (branch: Branch) => {}

  protected abstract getSubmitButtonToolTip = (): string | undefined => {
    return undefined
  }

  protected abstract getDialogTitle = (
    branchName: string
  ): string | JSX.Element | undefined => {
    return branchName
  }

  protected abstract renderActionStatusIcon = (): JSX.Element | null => {
    return null
  }

  public constructor(props: IBaseChooseBranchDialogProps) {
    super(props)

    const selectedBranch = this.resolveSelectedBranch()

    this.state = {
      selectedBranch,
      filterText: '',
      statusPreview: null,
    }
  }

  public componentDidMount() {
    const { selectedBranch } = this.state
    if (selectedBranch !== null) {
      this.updateStatus(selectedBranch)
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

    const { selectedBranch } = this.state

    if (selectedBranch !== null && selectedBranch.name === branch.name) {
      this.start()
    }
  }

  protected onSelectionChanged = async (selectedBranch: Branch | null) => {
    if (selectedBranch != null) {
      this.setState({ selectedBranch })
      return this.updateStatus(selectedBranch)
    }

    // return to empty state
    this.setState({ selectedBranch })
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
  protected resolveSelectedBranch(): Branch | null {
    const { currentBranch, defaultBranch, initialBranch } = this.props

    if (initialBranch !== undefined) {
      return initialBranch
    }

    return currentBranch === defaultBranch ? null : defaultBranch
  }

  private onOperationChange = (option: IDropdownSelectButtonOption) => {
    const value = option.value as MultiCommitOperationKind
    switch (value) {
      case MultiCommitOperationKind.Merge:
        this.props.dispatcher.updateMergeOperation(this.props.repository, false)
        break
      case MultiCommitOperationKind.Squash:
        this.props.dispatcher.updateMergeOperation(this.props.repository, true)
        break
      case MultiCommitOperationKind.Rebase:
      // TODO: dispatcher to switch multi commit operation to a rebase
      case MultiCommitOperationKind.CherryPick:
        break
      default:
        assertNever(value, `Unknown operation value: ${option.value}`)
    }
  }

  private getMergeOptions = (): IDropdownSelectButtonOption[] => {
    return [
      {
        label: 'Create a merge commit',
        description:
          'The commits from the selected branch will be added to the current branch via a merge commit.',
        value: MultiCommitOperationKind.Merge,
      },
      /*
      {
        label: 'Squash and merge',
        description:
          'The commits in the selected branch will be combined into one commit in the current branch.',
        value: MultiCommitOperationKind.Squash,
      },
      /* TODO: Add in when refactor rebase to multi commit operation
      {
        label: 'Rebase and merge',
        description:
          'The commits from the selected branch will be rebased and added to the current branch.',
        value: MultiCommitOperationKind.Rebase,
      },
      */
    ]
  }

  private renderStatusPreview() {
    const { currentBranch } = this.props
    const { selectedBranch, statusPreview: preview } = this.state

    if (
      preview == null ||
      currentBranch == null ||
      selectedBranch == null ||
      currentBranch.name === selectedBranch.name
    ) {
      return null
    }

    return (
      <div className="merge-status-component">
        {this.renderActionStatusIcon()}
        <p className="merge-info">{preview}</p>
      </div>
    )
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  public render() {
    const { selectedBranch } = this.state
    const { currentBranch, operation } = this.props
    const truncatedName = truncateWithEllipsis(currentBranch.name, 40)

    return (
      <Dialog
        id="choose-branch"
        onDismissed={this.props.onDismissed}
        onSubmit={this.start}
        dismissable={true}
        title={this.getDialogTitle(truncatedName)}
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
            onItemClick={this.onItemClick}
          />
        </DialogContent>
        <DialogFooter>
          {this.renderStatusPreview()}
          <DropdownSelectButton
            selectedValue={operation}
            options={this.getMergeOptions()}
            disabled={!this.canStart}
            tooltip={this.getSubmitButtonToolTip()}
            onSelectChange={this.onOperationChange}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
