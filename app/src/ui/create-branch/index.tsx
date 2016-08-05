import * as React from 'react'

import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
}

interface ICreateBranchState {

}

export default class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public render() {
    return (
      <div id='create-branch' className='panel'>
        <div className='header'>Create New Branch</div>
        <hr/>

        <label>Name <input type='text'/></label>

        <label>From
          <select>
            <option value='master'>master</option>
          </select>
        </label>

        <hr/>
        <button onClick={() => this.createBranch()}>Create Branch</button>
      </div>
    )
  }

  private createBranch() {

  }
}
