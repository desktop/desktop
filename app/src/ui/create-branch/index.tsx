import * as React from 'react'

import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import sanitizeBranchName from './sanitize-branch-name'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly branches: ReadonlyArray<string>
  readonly currentBranch: string | null
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string | null
  readonly sanitizedName: string | null
  readonly baseBranch: string | null
}

export default class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: null,
      sanitizedName: null,
      baseBranch: null,
    }
  }

  private renderSanitizedName() {
    if (this.state.proposedName === this.state.sanitizedName) { return null }

    return (
      <div>Will be created as {this.state.sanitizedName}</div>
    )
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName
    const currentBranch = this.props.currentBranch
    return (
      <div id='create-branch' className='panel'>
        <div className='header'>Create New Branch</div>
        <hr/>

        <label>Name <input type='text' onChange={event => this.onBranchNameChange(event)}/></label>

        {this.renderSanitizedName()}

        <label>From
          <select onChange={event => this.onBaseBranchChange(event)} defaultValue={currentBranch ? currentBranch : undefined}>
            {this.props.branches.map(branch => {
              return <option key={branch} value={branch}>{branch}</option>
            })}
          </select>
        </label>

        <hr/>
        <button onClick={() => this.createBranch()} disabled={disabled}>Create Branch</button>
      </div>
    )
  }

  private onBranchNameChange(event: React.FormEvent<HTMLInputElement>) {
    const str = event.target.value
    const sanitizedName = sanitizeBranchName(str)
    this.setState({
      currentError: this.state.currentError,
      proposedName: str,
      baseBranch: this.state.baseBranch,
      sanitizedName,
    })
  }

  private onBaseBranchChange(event: React.FormEvent<HTMLSelectElement>) {
    const baseBranch = event.target.value
    this.setState({
      currentError: this.state.currentError,
      proposedName: this.state.proposedName,
      baseBranch,
      sanitizedName: this.state.sanitizedName,
    })
  }

  private createBranch() {
    const name = this.state.sanitizedName
    const baseBranch = this.state.baseBranch
    if (name && name.length > 0 && baseBranch) {
      this.props.dispatcher.createBranch(this.props.repository, name, baseBranch)
    }

    this.props.dispatcher.closePopup()
  }
}
