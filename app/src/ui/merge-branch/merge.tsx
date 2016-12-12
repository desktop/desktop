import * as React from 'react'
import { Form } from '../lib/form'
import { Select } from '../lib/select'
import { Button } from '../lib/button'
import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../models/branch'
import { Repository } from '../../models/repository'

interface IMergeProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branches: ReadonlyArray<Branch>
}

interface IMergeState {
  readonly selectedBranch: Branch | null
}

export class Merge extends React.Component<IMergeProps, IMergeState> {
  public constructor(props: IMergeProps) {
    super(props)

    this.state = { selectedBranch: props.branches[0] || null }
  }

  public render() {
    const selectedBranch = this.state.selectedBranch
    const selectedValue = selectedBranch ? selectedBranch.name : null
    const disabled = !selectedBranch
    return (
      <Form onSubmit={this.merge}>
        <Select label='From' onChange={this.onBranchChange} value={selectedValue || undefined}>
          {this.props.branches.map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
        </Select>

        <hr/>

        <Button onClick={this.cancel}>Cancel</Button>
        <Button type='submit' disabled={disabled}>Merge</Button>
      </Form>
    )
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

    this.setState({ selectedBranch: branch })
  }
}
