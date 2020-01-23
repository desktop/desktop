import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from '../dialog'
import { Dispatcher } from '../dispatcher'
import { RetryAction, RetryActionType } from '../../models/retry-actions'

interface IForkUnreadyProps {
  readonly dispatcher: Dispatcher
  readonly retryAction: RetryAction
  readonly onDismissed: () => void
}

/**
 * Tell user that they're git operation failed because
 * the repository isn't finished forking yet on GitHub.
 */
export class ForkUnready extends React.Component<IForkUnreadyProps> {
  public render() {
    const repoName =
      this.props.retryAction.type !== RetryActionType.Clone &&
      this.props.retryAction.repository.gitHubRepository !== null
        ? this.props.retryAction.repository.gitHubRepository.fullName
        : 'your GitHub repository'

    return (
      <Dialog
        title={__DARWIN__ ? 'Fork Not Yet Available' : 'Fork not yet available'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        type="error"
      >
        <DialogContent>
          {`We were unable to reach ${repoName} because fork
          creation hasn't completed on GitHub. Please retry in just a moment.`}
        </DialogContent>
        <DialogFooter>
          <OkCancelButtonGroup okButtonText="Retry" />
        </DialogFooter>
      </Dialog>
    )
  }

  private onSubmit = () => {
    this.props.dispatcher.performRetry(this.props.retryAction)
    this.props.onDismissed()
  }
}
