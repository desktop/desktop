import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { TrashNameLabel } from '../lib/context-menu'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { RetryAction } from '../../models/retry-actions'

interface IRemoveRepositoryRetryDialogProps {
  readonly dispatcher: Dispatcher
  readonly retryAction: RetryAction

  /** The action to execute when the user cancels */
  readonly onDismissed: () => void
}

interface IRemoveRepositoryRetryDialogState {
  readonly retrying: boolean
}

export class RemoveRepositoryRetryDialog extends React.Component<
  IRemoveRepositoryRetryDialogProps,
  IRemoveRepositoryRetryDialogState
> {
  public constructor(props: IRemoveRepositoryRetryDialogProps) {
    super(props)

    this.state = { retrying: false }
  }

  public render() {
    const { retrying } = this.state

    return (
      <Dialog
        title="Error"
        id="remove-repository-retry"
        loading={retrying}
        disabled={retrying}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="error"
      >
        <DialogContent>
          <p>
            Failed to move the repository directory to {TrashNameLabel}
          </p>
          <p>
            A common reason for this is that the directory or one of its files is open in another program.
          </p>
          <div>
            <p>
              Do you want to retry removing the repository from GitHub Desktop?
            </p>
          </div>
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup destructive={true} okButtonText="Remove" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, retryAction } = this.props

    this.setState({ retrying: true })

    await dispatcher.performRetry(retryAction)

    this.props.onDismissed()
  }
}
