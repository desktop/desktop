import * as React from 'react'
import { Form } from '../lib/form'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'
import { getAheadBehind } from '../../lib/git'

interface IMergeProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branches: ReadonlyArray<Branch>
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

    const firstBranch = props.branches[0]
    this.state = {
      selectedBranch: firstBranch || null,
      commitCount: 0,
    }

    if (firstBranch) {
      this.updateCommitCount(firstBranch)
    }
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const selectedValue = selectedBranch ? selectedBranch.name : null
    const disabled = !selectedBranch
    const countPlural = this.state.commitCount === 1 ? 'commit' : 'commits'
    return (
      <Form onSubmit={this.merge}>
        <Select label='From' onChange={this.onBranchChange} value={selectedValue || undefined}>
          {this.props.branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
        </Select>

        <div>This will bring in {this.state.commitCount} {countPlural}.</div>

        <hr/>

        <Button onClick={this.cancel}>Cancel</Button>
        <Button type='submit' disabled={disabled}>Merge</Button>
      </Form>
    )
  }

  private async updateCommitCount(branch: Branch) {
    const range = `...${branch.name}`
    const aheadBehind = await getAheadBehind(this.props.repository, range)
    const commitCount = aheadBehind ? aheadBehind.behind : 0

    if (this.state.selectedBranch === branch) {
      this.setState({ ...this.state, commitCount })
      console.log(aheadBehind)
    }
  }

  private merge = () => {
    const branch = this.state.selectedBranch
    if (!branch) { return }

    this.props.dispatcher.mergeBranch(this.props.repository, branch.name)
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private onBranchChange = (event: React.FormEvent<HTMLSelectElement>) => {
    const index = event.currentTarget.selectedIndex
    const branch = this.props.branches[index]

    this.setState({ ...this.state, selectedBranch: branch })

    this.updateCommitCount(branch)
  }
}
