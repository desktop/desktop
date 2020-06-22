import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DefaultDialogFooter,
} from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Repository } from '../../models/repository'
import { RetryAction } from '../../models/retry-actions'
import { Dispatcher } from '../dispatcher'

interface ILocalChangesOverwrittenDialogProps {
  readonly repository: Repository
  readonly dispatcher: Dispatcher
  readonly hasExistingStash: boolean
  readonly retryAction: RetryAction | null
  readonly onDismissed: () => void
}
interface ILocalChangesOverwrittenDialogState {
  readonly loading: boolean
}

export class LocalChangesOverwrittenDialog extends React.Component<
  ILocalChangesOverwrittenDialogProps,
  ILocalChangesOverwrittenDialogState
> {
  public constructor(props: ILocalChangesOverwrittenDialogProps) {
    super(props)
    this.state = { loading: false }
  }

  public render() {
    return (
      <Dialog
        title="Error"
        loading={this.state.loading}
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="error"
      >
        <DialogContent>
          <p>
            Unable to perform this action when changes are present on your
            branch.
          </p>
          {this.renderStashText()}
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderStashText() {
    if (this.props.hasExistingStash) {
      return null
    }

    return <p>You can stash your changes now and recover them afterwards.</p>
  }

  private renderFooter() {
    if (this.props.hasExistingStash) {
      return <DefaultDialogFooter />
    }

    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={this.getStashLabel()}
          okButtonTitle="This will create a stash with your current changes. You can recover them by restoring the stash afterwards."
          cancelButtonText="Close"
        />
      </DialogFooter>
    )
  }

  private getStashLabel() {
    console.log('rafeca: ', this.props.retryAction)

    if (this.props.retryAction !== null) {
      return __DARWIN__
        ? 'Stash Changes and Continue'
        : 'Stash changes and continue'
    }

    return __DARWIN__ ? 'Stash Changes' : 'Stash changes'
  }

  private onSubmit = async () => {
    if (this.props.hasExistingStash) {
      // When there's an existing stash we don't let the user stash the changes and we
      // only show a "Close" button on the modal.
      // In that case, the "Close" button submits the dialog and should only dismiss it.
      this.props.onDismissed()
      return
    }

    this.setState({ loading: true })

    if (!this.props.hasExistingStash) {
      await this.props.dispatcher.createStashForCurrentBranch(
        this.props.repository,
        true
      )
    }

    if (this.props.retryAction !== null) {
      await this.props.dispatcher.performRetry(this.props.retryAction)
    }

    this.props.onDismissed()
  }
}
