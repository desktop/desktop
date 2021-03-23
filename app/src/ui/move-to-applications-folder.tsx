import * as React from 'react'
import { sendNonFatalException } from '../lib/helpers/non-fatal-exception'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from './dialog'
import { Dispatcher } from './dispatcher'

interface IMoveToApplicationsFolderProps {
  readonly dispatcher: Dispatcher

  /**
   * Callback to use when the dialog gets closed.
   */
  readonly onDismissed: () => void
}

export class MoveToApplicationsFolder extends React.Component<
  IMoveToApplicationsFolderProps
> {
  public render() {
    return (
      <Dialog
        title="Move GitHub Desktop to the Applications folder?"
        id="move-to-applications-folder"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onSubmit}
        type="warning"
      >
        <DialogContent>
          <p>
            We've detected that you're not running GitHub Desktop from the
            Applications folder of your machine. This could cause problems with
            the app, including impacting your ability to sign in.
            <br />
            <br />
            Do you want to move GitHub Desktop to the Applications folder now?
            This will also restart the app.
          </p>
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText={'Move and Restart'}
          okButtonTitle="This will move GitHub Desktop to the Applications folder in your machine and restart the app."
          cancelButtonText="Cancel"
        />
      </DialogFooter>
    )
  }

  private onSubmit = async () => {
    try {
      this.props.dispatcher.moveToApplicationsFolder()
    } catch (error) {
      sendNonFatalException('moveApplication', error)
    }

    this.props.onDismissed()
  }
}
