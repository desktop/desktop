import * as React from 'react'

import { Dispatcher } from '../../lib/dispatcher'
import { Repository } from '../../models/repository'
import { Branch } from '../../models/branch'
import { Form } from '../lib/form'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IDeleteBranchProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly branch: Branch
  readonly onDismissed: () => void
}

export class DeleteBranch extends React.Component<IDeleteBranchProps, void> {
  public render() {
    return (
      <Dialog
        id='delete-branch'
        title={__DARWIN__ ? 'Delete Branch' : 'Delete branch'}
        type='warning'
        onDismissed={this.props.onDismissed}
      >
        <Form onSubmit={this.props.onDismissed}>
          <DialogContent>
            <div>Delete branch "{this.props.branch.name}"?</div>
            <div>This cannot be undone.</div>
          </DialogContent>
          <DialogFooter>
            <ButtonGroup>
              <Button type='submit'>Cancel</Button>
              <Button onClick={this.deleteBranch}>Delete</Button>
            </ButtonGroup>
          </DialogFooter>
        </Form>
      </Dialog>
    )
  }

  private deleteBranch = () => {
    this.props.dispatcher.deleteBranch(this.props.repository, this.props.branch)
    this.props.dispatcher.closePopup()
  }
}
