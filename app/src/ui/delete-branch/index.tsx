import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../lib/local-git-operations'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
}

export class DeleteBranch extends React.Component<IDeleteBranchProps, void> {
  public render() {
    return (
      <form className='panel' onSubmit={event => this.cancel(event)}>
        <div>Delete branch "{this.props.branch.name}"?</div>
        <div>This cannot be undone.</div>

        <button type='submit'>Cancel</button>
        <button onClick={() => this.deleteBranch()}>Delete</button>
      </form>
    )
  }

  private cancel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    this.props.dispatcher.closePopup()
  }

  private deleteBranch() {
    this.props.dispatcher.deleteBranch(this.props.repository, this.props.branch)
    this.props.dispatcher.closePopup()
  }
}
