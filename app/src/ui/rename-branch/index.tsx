import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import Repository from '../../models/repository'
import { Branch } from '../../lib/local-git-operations'
import sanitizedBranchName from '../create-branch/sanitized-branch-name'

interface IRenameBranchProps {
  readonly dispacher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
}

interface IRenameBranchState {
  readonly newName: string
}

export default class RenameBranch extends React.Component<IRenameBranchProps, IRenameBranchState> {
  public constructor(props: IRenameBranchProps) {
    super(props)

    this.state = { newName: props.branch.name }
  }

  private renderError() {
    const sanitizedName = sanitizedBranchName(this.state.newName)
    if (sanitizedName !== this.state.newName) {
      return <div>Will be created as {sanitizedName}</div>
    } else {
      return null
    }
  }

  public render() {
    const disabled = !this.state.newName.length
    return (
      <form className='panel' onSubmit={event => this.renameBranch(event)}>
        <label>
          Name <input value={this.state.newName}
                      autoFocus={true}
                      onChange={event => this.onNameChange(event)}
                      onKeyDown={event => this.onKeyDown(event)}/>
        </label>

        {this.renderError()}

        <button onClick={() => this.cancel()}>Cancel</button>
        <button type='submit' disabled={disabled}>Rename {this.props.branch.name}</button>
      </form>
    )
  }

  private onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      this.props.dispacher.closePopup()
    }
  }

  private onNameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({ newName: event.target.value })
  }

  private cancel() {
    this.props.dispacher.closePopup()
  }

  private renameBranch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    this.props.dispacher.closePopup()
  }
}
