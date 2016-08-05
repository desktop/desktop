import * as React from 'react'

import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
// import { LocalGitOperations } from '../../lib/local-git-operations'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly branches: ReadonlyArray<string>
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string | null
  readonly baseBranch: string | null
}

export default class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: null,
      baseBranch: null,
    }
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName
    return (
      <div id='create-branch' className='panel'>
        <div className='header'>Create New Branch</div>
        <hr/>

        <label>Name <input type='text' onChange={event => this.onBranchNameChange(event)}/></label>

        <label>From
          <select>
            {this.props.branches.map(branch => <option key={branch} value={branch}>{branch}</option>)}
          <select onChange={event => this.onBaseBranchChange(event)} defaultValue={currentBranch ? currentBranch : undefined}>
          </select>
        </label>

        <hr/>
        <button onClick={() => this.createBranch()} disabled={disabled}>Create Branch</button>
      </div>
    )
  }

  private onBranchNameChange(event: React.FormEvent<HTMLInputElement>) {
    const str = event.target.value
    this.setState({
      currentError: this.state.currentError,
      proposedName: str,
      baseBranch: this.state.baseBranch,
    })
  }

  private onBaseBranchChange(event: React.FormEvent<HTMLSelectElement>) {
    const baseBranch = event.target.value
    this.setState({
      currentError: this.state.currentError,
      proposedName: this.state.proposedName,
      baseBranch,
    })
  }

  }
}
