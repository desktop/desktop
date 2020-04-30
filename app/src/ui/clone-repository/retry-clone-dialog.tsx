import * as React from 'react'
import { RetryAction } from '../../models/retry-actions'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { OkCancelButtonGroup } from '../dialog/ok-cancel-button-group'
import { Ref } from '../lib/ref'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

interface IRetryCloneProps {
  readonly repository: Repository | CloningRepository
  readonly retryAction: RetryAction
  readonly onDismissed: () => void
  readonly dispatcher: Dispatcher
  readonly errorMessage: string
}

/**
 * A dialog to display to the user that cloning has failed and potentially
 * allow them to choose to dismiss or clone again if a RetryAction is available.
 */
export class RetryCloneDialog extends React.Component<IRetryCloneProps> {
  public constructor(props: IRetryCloneProps) {
    super(props)
  }

  public render() {
    return (
      <Dialog
        id="clone-failed"
        title={__DARWIN__ ? 'Retry Clone' : 'Retry clone'}
        type="error"
        onDismissed={this.props.onDismissed}
        onSubmit={this.cloneAgain}
      >
        <DialogContent>
          <p>{this.getCloneFailureExplanation()}</p>
        </DialogContent>

        <DialogFooter>
          <OkCancelButtonGroup
            okButtonText={__DARWIN__ ? 'Retry Clone' : 'Retry clone'}
          />
        </DialogFooter>
      </Dialog>
    )
  }

  private getCloneFailureExplanation() {
    if (this.props.errorMessage.length === 0) {
      return (
        <p>
          Cloning failed to complete. You can attempt to retry to clone
          <em>{this.props.repository.name}</em> or dismiss this warning.
        </p>
      )
    }

    return (
      <div>
        {this.props.errorMessage}
        <p>
          Would you like to retry cloning{' '}
          <Ref>{this.props.repository.name}</Ref>?
        </p>
      </div>
    )
  }

  private cloneAgain = async () => {
    if (this.props.retryAction != null) {
      this.props.dispatcher.closePopup()
      await this.props.dispatcher.performRetry(this.props.retryAction)
    }
  }
}
