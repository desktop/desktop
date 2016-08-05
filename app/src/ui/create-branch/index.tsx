import * as React from 'react'

import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
// import { LocalGitOperations } from '../../lib/local-git-operations'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string | null
}

export default class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: null,
    }
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName
    return (
      <div id='create-branch' className='panel'>
        <div className='header'>Create New Branch</div>
        <hr/>

        <label>Name <input type='text' onChange={event => this.onChange(event)}/></label>

        <label>From
          <select>
            <option value='master'>master</option>
          </select>
        </label>

        <hr/>
        <button onClick={() => this.createBranch()} disabled={disabled}>Create Branch</button>
      </div>
    )
  }

  private onChange(event: React.FormEvent<HTMLInputElement>) {
    const str = event.target.value
    this.setState({
      currentError: this.state.currentError,
      proposedName: str,
    })
  }

  private createBranch() {

  }
}
