import * as React from 'react'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Dispatcher } from '../dispatcher'
import { TrashNameLabel } from '../lib/context-menu'
import { RetryAction } from '../../models/retry-actions'

interface IDiscardChangesRetryDialogProps {
  readonly dispatcher: Dispatcher
  readonly retryAction: RetryAction
  readonly onDismissed: () => void
}

interface IDiscardChangesRetryDialogState {
  readonly retrying: boolean
}

export class DiscardChangesRetryDialog extends React.Component<
  IDiscardChangesRetryDialogProps,
  IDiscardChangesRetryDialogState
> {
  public constructor(props: IDiscardChangesRetryDialogProps) {
    super(props)
    this.state = { retrying: false }
  }

  public render() {
    const { retrying } = this.state

    return (
      <Dialog
        title="Error"
        id="discard-changes-retry"
        loading={retrying}
        disabled={retrying}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="error"
      >
        <DialogContent>
          <p>Failed to discard changes to {TrashNameLabel}.</p>
          <p>
            Common reasons are:
            <ul>
              <li>
                The {TrashNameLabel} is configured to delete items immediately.
              </li>
              <li>Restricted access to move the file(s).</li>
            </ul>
          </p>
          <p>These changes will be unrecoverable from the {TrashNameLabel}.</p>
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={
            __DARWIN__
              ? 'Permannetly Discard Changes and Continue'
              : 'Permannetly discard changes and continue'
          }
          okButtonTitle={`This will discard changes and they will be unrecoverable.`}
          cancelButtonText="Cancel"
          destructive={true}
        />
      </DialogFooter>
    )
  }

  private onSubmit = async () => {
    const { dispatcher, retryAction } = this.props

    this.setState({ retrying: true })

    await dispatcher.performRetry(retryAction)

    this.props.onDismissed()
  }
}
