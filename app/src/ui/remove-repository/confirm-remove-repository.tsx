import * as React from 'react'
import { ButtonGroup } from '../../ui/lib/button-group'
import { Button } from '../../ui/lib/button'
import { Dialog, DialogContent, DialogFooter } from '../../ui/dialog'
import { Repository } from '../../models/repository'

interface IConfirmRemoveRepositoryProps {
  /** The title of the dialog window */
  readonly title: string

  /** The message to be displayed */
  readonly message: string

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
        type='warning'
        title={this.props.title}
        onDismissed={this.cancel}
        onSubmit={this.onConfirmed}
      >
        <DialogContent>
          <p>{this.props.message}</p>
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
