import * as React from 'react'
import { RetryAction } from '../../models/retry-actions'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Dispatcher } from '../dispatcher'
import { Repository } from '../../models/repository'
import { CloningRepository } from '../../models/cloning-repository'

interface IRetryCloneProps {
  readonly repository: Repository | CloningRepository
  readonly retryAction?: RetryAction
  readonly onDismissed: () => void
  readonly dispatcher: Dispatcher
  readonly message?: string
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
        title={__DARWIN__ ? 'Cloning Failed' : 'Cloning failed'}
        type="error"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>{this.getCloneFailureExplanation}</p>
        </DialogContent>

        <DialogFooter>
          {this.props.retryAction != null ? (
            <ButtonGroup>
              <Button type="submit" onClick={this.cloneAgain}>
                {__DARWIN__ ? 'Retry Clone' : 'Retry clone'}
              </Button>
              <Button onClick={this.props.onDismissed}>Cancel</Button>
            </ButtonGroup>
          ) : (
            <Button type="submit" onClick={this.props.onDismissed}>
              Close
            </Button>
          )}
        </DialogFooter>
      </Dialog>
    )
  }

  private getCloneFailureExplanation() {
    if (this.props.message != null && this.props.message.length !== 0) {
      return this.props.message
    }

    return (
      <p>
        Cloning failed to complete. You can attempt to retry to clone
        <em>{this.props.repository.name}</em> or dismiss this warning.
      </p>
    )
  }

  private cloneAgain = async () => {
    if (this.props.retryAction != null) {
      this.props.dispatcher.closePopup()
      await this.props.dispatcher.performRetry(this.props.retryAction)
    }
  }
}
