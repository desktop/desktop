import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'

interface ICreateForkDialogProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly onDismissed: () => void
}

/**
 * Dialog offering to make a fork of the given repository
 */
export class CreateForkDialog extends React.Component<
  ICreateForkDialogProps,
  {}
> {
  /**
   *  Starts fork process on GitHub!
   */
  private onSubmit = async () => {
    await this.props.dispatcher.createFork(this.props.repository)
    this.props.onDismissed()
  }

  public render() {
    return (
      <Dialog
        title={__DARWIN__ ? 'Create Fork' : 'Create fork'}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="normal"
      >
        <DialogContent>Hmm, your push failed. Create a fork?</DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup
            destructive={true}
            okButtonText={__DARWIN__ ? 'Create Fork' : 'Create fork'}
          />
        </DialogFooter>
      </Dialog>
    )
  }
}
