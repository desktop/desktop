import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Branch } from '../../lib/local-git-operations'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly branch: Branch
}

export default class DeleteBranch extends React.Component<IDeleteBranchProps, void> {
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

  }
}
