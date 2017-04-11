import * as React from 'react'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { getAheadBehind } from '../../lib/git'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { BranchList } from '../branches/branch-list'

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
    }
  }

  public componentDidMount() {
    const branch = this.state.selectedBranch
    if (!branch) { return }

    this.updateCommitCount(branch)
  }

  private onFilterKeyDown = (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (filter.length === 0) {
        this.props.onDismissed()
        event.preventDefault()
      }
    }
  }

  private onSelectionChanged = (selectedBranch: Branch | null) => {
    if (selectedBranch) {
      this.setState({ selectedBranch })
      this.updateCommitCount(selectedBranch)
    } else {
      this.setState({ selectedBranch, commitCount: 0 })
    }
  }

  private renderMergeInfo() {

    const commitCount = this.state.commitCount
    const countPlural = commitCount === 1 ? 'commit' : 'commits'
    const countText = commitCount === undefined
      ? 'commits'
      : <strong>{commitCount} {countPlural}</strong>

    const selectedBranch = this.state.selectedBranch

    return (
      <p className='merge-info'>
        This will bring in {countText}
        {' from '}
        <strong>{selectedBranch ? selectedBranch.name : 'HEAD'}</strong>
      </p>
    )
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const currentBranch = this.props.currentBranch

    const disabled = (selectedBranch === null || currentBranch === null) || currentBranch.name === selectedBranch.name

    const mergeInfo = disabled ? null : this.renderMergeInfo()

    return (
      <Dialog
        id='merge'
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
            onFilterKeyDown={this.onFilterKeyDown}
            selectedBranch={selectedBranch}
            onSelectionChanged={this.onSelectionChanged}
          />
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' disabled={disabled}>
              Merge into <strong>{currentBranch ? currentBranch.name : ''}</strong>
            </Button>
          </ButtonGroup>
          {mergeInfo}
        </DialogFooter>
      </Dialog>
    )
  }

  private async updateCommitCount(branch: Branch) {
    this.setState({ commitCount: undefined })

    const range = `...${branch.name}`
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    // The branch changed while we were waiting on the result of
    // `getAheadBehind`.
    if (this.state.selectedBranch !== branch) { return }

    this.setState({ commitCount })
  }

  private merge = () => {
    const branch = this.state.selectedBranch
    if (!branch) { return }

    this.props.dispatcher.mergeBranch(this.props.repository, branch.name)
    this.props.dispatcher.closePopup()
  }
}
