import * as React from 'react'
import { ButtonGroup } from '../../ui/lib/button-group'
import { Button } from '../../ui/lib/button'
import { Dialog, DialogContent, DialogFooter } from '../../ui/dialog'
import { Repository } from '../../models/repository'

interface IConfirmRemoveRepositoryProps {
  /** The repository to be removed */
  readonly repository: Repository

  /** The action to execute when the user confirms */
  readonly onConfirmation: (repo: Repository) => void

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

export class ConfirmRemoveRepository extends React.Component<IConfirmRemoveRepositoryProps, void> {
  private cancel = () => {
    this.props.onDismissed()
  }

  private onConfirmed = () => {
    this.props.onConfirmation(this.props.repository)
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        id='confirm-remove-repository'
        key='remove-repository-confirmation'
        type='warning'
        title={ __DARWIN__ ? 'Remove Repository' : 'Remove repository' }
        onDismissed={this.cancel}
        onSubmit={this.onConfirmed}
      >
        <DialogContent>
          <p>Are you sure you want to remove the repository "{this.props.repository.name}"?</p>
          <p className='description'>
            The repository will be removed from GitHub Desktop but will remain on disk.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type='submit'>Yes</Button>
            <Button onClick={this.cancel}>No</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
