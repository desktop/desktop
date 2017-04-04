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

  readonly defaultBranch: Branch | null
  readonly currentBranch: Branch | null
  readonly allBranches: ReadonlyArray<Branch>
  readonly recentBranches: ReadonlyArray<Branch>

  readonly onDismissed: () => void
}

interface IMergeState {
  /** The currently selected branch. */
  readonly selectedBranch: Branch | null

  /** The number of commits that would be brought in by the merge. */
  readonly commitCount: number
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
      commitCount: 0,
    }
  }

  public componentDidMount() {
    const branch = this.state.selectedBranch
    if (!branch) { return }

    this.updateCommitCount(branch)
  }

  private onFilterKeyDown = (filter: string, event: React.KeyboardEvent<HTMLInputElement>) => {

  }

  private onItemClick = (item: Branch) => {
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    // const selectedValue = selectedBranch ? selectedBranch.name : null
    const disabled = !selectedBranch
    const countPlural = this.state.commitCount === 1 ? 'commit' : 'commits'
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
            currentBranch={this.props.currentBranch}
            defaultBranch={this.props.defaultBranch}
            recentBranches={this.props.recentBranches}
            onFilterKeyDown={this.onFilterKeyDown}
            onItemClick={this.onItemClick}
          />
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit' disabled={disabled}>Merge</Button>
            <Button onClick={this.cancel}>Cancel</Button>
          </ButtonGroup>
          <p>This will bring in {this.state.commitCount} {countPlural}.</p>
        </DialogFooter>
      </Dialog>
    )
  }

  private async updateCommitCount(branch: Branch) {
    const range = `...${branch.name}`
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    // The branch changed while we were waiting on the result of
    // `getAheadBehind`.
    if (this.state.selectedBranch !== branch) { return }

    this.setState({ ...this.state, commitCount })
  }

  private merge = () => {
    const branch = this.state.selectedBranch
    if (!branch) { return }

    this.props.dispatcher.mergeBranch(this.props.repository, branch.name)
    this.props.dispatcher.closePopup()
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  // private onBranchChange = (event: React.FormEvent<HTMLSelectElement>) => {
  //   const index = event.currentTarget.selectedIndex
  //   const branch = this.props.branches[index]

  //   this.setState({ ...this.state, selectedBranch: branch })

  //   this.updateCommitCount(branch)
  // }
}
