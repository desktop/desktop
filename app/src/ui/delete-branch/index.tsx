import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Form } from '../lib/form'
import { Button } from '../lib/button'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
}

export class DeleteBranch extends React.Component<IDeleteBranchProps, void> {
  public render() {
    return (
      <Form onSubmit={this.cancel}>
        <div>Delete branch "{this.props.branch.name}"?</div>
        <div>This cannot be undone.</div>

        <Button type='submit'>Cancel</Button>
        <Button onClick={this.deleteBranch}>Delete</Button>
      </Form>
    )
  }

  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  private deleteBranch = () => {
    this.props.dispatcher.deleteBranch(this.props.repository, this.props.branch)
    this.props.dispatcher.closePopup()
  }
}
