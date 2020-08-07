import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { RetryAction, RetryActionType } from '../../models/retry-actions'
import { Dispatcher } from '../dispatcher'
import { assertNever } from '../../lib/fatal-error'

interface ILocalChangesOverwrittenDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  /**
   * Whether there's already a stash entry for the local branch.
   */
  readonly hasExistingStash: boolean
  /**
   * The action that should get executed if the user selects "Stash and Continue".
   */
  readonly retryAction: RetryAction
  /**
   * Callback to use when the dialog gets closed.
   */
  readonly onDismissed: () => void
}
interface ILocalChangesOverwrittenDialogState {
  readonly stashingAndRetrying: boolean
}

export class LocalChangesOverwrittenDialog extends React.Component<
  ILocalChangesOverwrittenDialogProps,
  ILocalChangesOverwrittenDialogState
> {
  public constructor(props: ILocalChangesOverwrittenDialogProps) {
    super(props)
    this.state = { stashingAndRetrying: false }
  }

  public render() {
    return (
      <Dialog
        title="Error"
        loading={this.state.stashingAndRetrying}
        disabled={this.state.stashingAndRetrying}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="error"
      >
        <DialogContent>
          <p>
            Unable to {this.getRetryActionName()} when changes are present on
            your branch.
          </p>
          {this.renderStashText()}
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderStashText() {
    if (this.props.hasExistingStash && !this.state.stashingAndRetrying) {
      return null
    }

    return <p>You can stash your changes now and recover them afterwards.</p>
  }

  private renderFooter() {
    if (this.props.hasExistingStash && !this.state.stashingAndRetrying) {
      return <DefaultDialogFooter />
    }

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={
            __DARWIN__
              ? 'Stash Changes and Continue'
              : 'Stash changes and continue'
          }
          okButtonTitle="This will create a stash with your current changes. You can recover them by restoring the stash afterwards."
          cancelButtonText="Close"
        />
      </DialogFooter>
    )
  }

  private onSubmit = async () => {
    if (this.props.hasExistingStash) {
      // When there's an existing stash we don't let the user stash the changes and we
      // only show a "Close" button on the modal.
      // In that case, the "Close" button submits the dialog and should only dismiss it.
      this.props.onDismissed()
      return
    }

    this.setState({ stashingAndRetrying: true })

    await this.props.dispatcher.createStashForCurrentBranch(
      this.props.repository,
      true
    )
    await this.props.dispatcher.performRetry(this.props.retryAction)

    this.props.onDismissed()
  }

  /**
   * Returns a user-friendly string to describe the current retryAction.
   */
  private getRetryActionName() {
    switch (this.props.retryAction.type) {
      case RetryActionType.Checkout:
        return 'checkout'
      case RetryActionType.Pull:
        return 'pull'
      case RetryActionType.Merge:
        return 'merge'
      case RetryActionType.Rebase:
        return 'rebase'
      case RetryActionType.Clone:
        return 'clone'
      case RetryActionType.Fetch:
        return 'fetch'
      case RetryActionType.Push:
        return 'push'
      default:
        assertNever(
          this.props.retryAction,
          `Unknown retryAction: ${this.props.retryAction}`
        )
    }
  }
}
