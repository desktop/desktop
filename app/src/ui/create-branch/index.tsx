import * as React from 'react'

import Repository from '../../models/repository'
import { Dispatcher } from '../../lib/dispatcher'
import sanitizedBranchName from './sanitized-branch-name'
import { find, findIndex } from '../../lib/find'
import { Branch } from '../../lib/local-git-operations'

interface ICreateBranchProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly branches: ReadonlyArray<Branch>
  readonly currentBranch: Branch | null
}

interface ICreateBranchState {
  readonly currentError: Error | null
  readonly proposedName: string | null
  readonly sanitizedName: string | null
  readonly baseBranch: Branch | null
}

/** The Create Branch component. */
export default class CreateBranch extends React.Component<ICreateBranchProps, ICreateBranchState> {
  public constructor(props: ICreateBranchProps) {
    super(props)

    this.state = {
      currentError: null,
      proposedName: null,
      sanitizedName: null,
      baseBranch: this.props.currentBranch,
    }
  }

  public componentDidMount() {
    this.props.dispatcher.loadBranches(this.props.repository)
  }

  private renderError() {
    const error = this.state.currentError
    if (error) {
      return <div>{error.message}</div>
    } else {
      if (this.state.proposedName === this.state.sanitizedName) { return null }

      return (
        <div>Will be created as {this.state.sanitizedName}</div>
      )
    }
  }

  public render() {
    const proposedName = this.state.proposedName
    const disabled = !proposedName || !!this.state.currentError
    const currentBranch = this.props.currentBranch
    return (
      <div id='create-branch' className='panel'>
        <div className='header'>Create New Branch</div>
        <hr/>

        <label>Name <input type='text' onChange={event => this.onBranchNameChange(event)}/></label>

        {this.renderError()}

        <label>From
          <select onChange={event => this.onBaseBranchChange(event)}
                  defaultValue={currentBranch ? currentBranch.name : undefined}>
            {this.props.branches.map(branch => <option key={branch.name} value={branch.name}>{branch.name}</option>)}
          </select>
        </label>

        <hr/>
        <button onClick={() => this.createBranch()} disabled={disabled}>Create Branch</button>
      </div>
    )
  }

  private onBranchNameChange(event: React.FormEvent<HTMLInputElement>) {
    // TODO: event.target should be a generic value
    // see https://github.com/desktop/desktop/issues/297 for details
    const input = event.target as HTMLInputElement

    if (input) {
      const str = input.value
      const sanitizedName = sanitizedBranchName(str)
      const alreadyExists = findIndex(this.props.branches, b => b.name === sanitizedName) > -1
      let currentError: Error | null = null
      if (alreadyExists) {
        currentError = new Error(`A branch named ${sanitizedName} already exists`)
      }

      this.setState({
        currentError,
        proposedName: str,
        baseBranch: this.state.baseBranch,
        sanitizedName,
      })
    }
  }

  private onBaseBranchChange(event: React.FormEvent<HTMLSelectElement>) {
    // TODO: event.target should be a generic value
    // see https://github.com/desktop/desktop/issues/297 for details
    const input = event.target as HTMLSelectElement

    if (input) {
      const baseBranchName = input.value
      const baseBranch = find(this.props.branches, b => b.name === baseBranchName)!
      this.setState({
        currentError: this.state.currentError,
        proposedName: this.state.proposedName,
        baseBranch,
        sanitizedName: this.state.sanitizedName,
      })
    }
  }

  private createBranch() {
    const name = this.state.sanitizedName
    const baseBranch = this.state.baseBranch
    if (name && name.length > 0 && baseBranch) {
      this.props.dispatcher.createBranch(this.props.repository, name, baseBranch.name)
    }

    this.props.dispatcher.closePopup()
  }
}
