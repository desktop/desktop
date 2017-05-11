import * as React from 'react'
import { ButtonGroup } from '../ui/lib/button-group'
import { Button } from '../ui/lib/button'
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog'

interface IConfirmDialogProps {
  /** The title of the dialog window */
  readonly title: string

  /** The message to be displayed */
  readonly message: string

  /** The action to execute when the user confirms */
  readonly onConfirmation: () => void

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

export class ConfirmDialog extends React.Component<IConfirmDialogProps, void> {
  private cancel = () => {
    this.props.onDismissed()
  }

  private onConfirmed = () => {
    this.props.onConfirmation()
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
