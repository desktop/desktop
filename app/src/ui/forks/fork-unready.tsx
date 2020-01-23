import * as React from 'react'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
  DefaultDialogFooter,
} from '../dialog'
import { Dispatcher } from '../dispatcher'
import { RetryAction } from '../../models/retry-actions'
import { RepositoryWithGitHubRepository } from '../../models/repository'

interface IForkUnreadyProps {
  readonly dispatcher: Dispatcher
  readonly repository: RepositoryWithGitHubRepository
  readonly retryAction?: RetryAction
  readonly onDismissed: () => void
}

/**
 * Tell user that they're git operation failed because
 * the repository isn't finished forking yet on GitHub.
 */
export class ForkUnready extends React.Component<IForkUnreadyProps> {
  public render() {
    return (
      <Dialog
        title={__DARWIN__ ? 'Fork Not Yet Available' : 'Fork not yet available'}
        onSubmit={this.onSubmit}
        onDismissed={this.props.onDismissed}
        type="error"
        id="fork-unready"
      >
        <DialogContent>
          {`We were unable to reach `}
          <strong>{this.props.repository.gitHubRepository.fullName}</strong>
          {` because fork creation hasn't completed on GitHub.
          Please retry in just a moment.`}
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFooter() {
    return this.props.retryAction !== undefined ? (
      <DialogFooter>
        <OkCancelButtonGroup okButtonText="Retry" />
      </DialogFooter>
    ) : (
      <DefaultDialogFooter />
    )
  }

  private onSubmit = () => {
    if (this.props.retryAction !== undefined) {
      this.props.dispatcher.performRetry(this.props.retryAction)
    }
    this.props.onDismissed()
  }
}
