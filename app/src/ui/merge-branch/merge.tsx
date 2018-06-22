import * as React from 'react'

import { getAheadBehind } from '../../lib/git'
import { Dispatcher } from '../../lib/dispatcher'

import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'

import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { BranchList, IBranchListItem, renderDefaultBranch } from '../branches'
import { revSymmetricDifference } from '../../lib/git'
import { IMatches } from '../../lib/fuzzy-find'

interface IMergeProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository

  /**
   * See IBranchesState.defaultBranch
   */
  readonly defaultBranch: Branch | null

  /**
   * The currently checked out branch or null if HEAD is detached
   */
  readonly currentBranch: Branch | null

  /**
   * See IBranchesState.allBranches
   */
  readonly allBranches: ReadonlyArray<Branch>

  /**
   * See IBranchesState.recentBranches
   */
  readonly recentBranches: ReadonlyArray<Branch>

  /**
   * A function that's called when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

interface IMergeState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /**
   * The number of commits that would be brought in by the merge.
   * undefined if no branch is selected or still calculating the
   * number of commits.
   */
  readonly commitCount?: number

  /** The filter text to use in the branch selector */
  readonly filterText: string
}

/** A component for merging a branch into the current branch. */
export class Merge extends React.Component<IMergeProps, IMergeState> {
  public constructor(props: IMergeProps) {
    super(props)

    const currentBranch = props.currentBranch
    const defaultBranch = props.defaultBranch

    this.state = {
      // Select the default branch unless that's currently checked out
      selectedBranch: currentBranch === defaultBranch ? null : defaultBranch,
      commitCount: undefined,
      filterText: '',
    }
  }

  public componentDidMount() {
    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    this.updateCommitCount(branch)
  }

  private onFilterTextChanged = (filterText: string) => {
    this.setState({ filterText })
  }

  private onSelectionChanged = async (selectedBranch: Branch | null) => {
    if (selectedBranch) {
      this.setState({ selectedBranch })
      await this.updateCommitCount(selectedBranch)
    } else {
      this.setState({ selectedBranch, commitCount: 0 })
    }
  }

  private renderMergeInfo() {
    const commitCount = this.state.commitCount
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    if (
      selectedBranch === null ||
      currentBranch === null ||
      currentBranch.name === selectedBranch.name
    ) {
      return null
    }

    if (commitCount === 0) {
      return <p className="merge-info">Nothing to merge</p>
    }

    const countPlural = commitCount === 1 ? 'commit' : 'commits'
    const countText =
      commitCount === undefined ? (
        'commits'
      ) : (
        <strong>
          {commitCount} {countPlural}
        </strong>
      )

    return (
      <p className="merge-info">
        This will bring in {countText}
        {' from '}
        <strong>{selectedBranch ? selectedBranch.name : 'HEAD'}</strong>
      </p>
    )
  }

  private renderBranch = (item: IBranchListItem, matches: IMatches) => {
    return renderDefaultBranch(item, matches, this.props.currentBranch)
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    const disabled =
      selectedBranch === null ||
      currentBranch === null ||
      currentBranch.name === selectedBranch.name ||
      this.state.commitCount === 0

    return (
      <Dialog
        id="merge"
        title={__DARWIN__ ? 'Merge Branch' : 'Merge branch'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.merge}
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
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              Merge into{' '}
              <strong>{currentBranch ? currentBranch.name : ''}</strong>
            </Button>
          </ButtonGroup>
          {this.renderMergeInfo()}
        </DialogFooter>
      </Dialog>
    )
  }

  private async updateCommitCount(branch: Branch) {
    const range = revSymmetricDifference('', branch.name)
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    if (this.state.selectedBranch !== branch) {
      // The branch changed while we were waiting on the result of `getAheadBehind`.
      this.setState({ commitCount: undefined })
    } else {
      this.setState({ commitCount })
    }
  }

  private merge = () => {
    const branch = this.state.selectedBranch
    if (!branch) {
      return
    }

    this.props.dispatcher.mergeBranch(this.props.repository, branch.name)
    this.props.dispatcher.closePopup()
  }
}
