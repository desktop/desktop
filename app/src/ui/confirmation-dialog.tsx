import * as React from 'react'
import { Dispatcher } from '../lib/dispatcher'
import { ButtonGroup } from '../ui/lib/button-group'
import { Button } from '../ui/lib/button'
import { Dialog, DialogContent, DialogFooter } from '../ui/dialog'

interface IConfirmationDialog {
  readonly dispatcher: Dispatcher
  readonly onConfirmation: () => void
}

export class ConfirmationDialog extends React.Component<IConfirmationDialog, void> {
  private cancel = () => {
    this.props.dispatcher.closePopup()
  }

  public render() {
    return (
      <Dialog
        title={ __DARWIN__ ? 'Mac OS' : 'Windows' }
        onDismissed={this.cancel}
        onSubmit={this.props.onConfirmation}
      >
      <DialogContent>
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
