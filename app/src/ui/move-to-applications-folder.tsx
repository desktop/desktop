import * as React from 'react'
import { sendNonFatalException } from '../lib/helpers/non-fatal-exception'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  OkCancelButtonGroup,
} from './dialog'
import { Dispatcher } from './dispatcher'
import { Checkbox, CheckboxValue } from './lib/checkbox'

interface IMoveToApplicationsFolderProps {
  readonly dispatcher: Dispatcher

  /**
   * Callback to use when the dialog gets closed.
   */
  readonly onDismissed: () => void
}

interface IMoveToApplicationsFolderState {
  readonly askToMoveToApplicationsFolder: boolean
}

export class MoveToApplicationsFolder extends React.Component<
  IMoveToApplicationsFolderProps,
  IMoveToApplicationsFolderState
> {
  public constructor(props: IMoveToApplicationsFolderProps) {
    super(props)
    this.state = {
      askToMoveToApplicationsFolder: true,
    }
  }

  public render() {
    return (
      <Dialog
        title="Move GitHub Desktop to the Applications folder?"
        id="move-to-applications-folder"
        dismissable={false}
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
          <div>
            <Checkbox
              label="Do not show this message again"
              value={
                this.state.askToMoveToApplicationsFolder
                  ? CheckboxValue.Off
                  : CheckboxValue.On
              }
              onChange={this.onAskToMoveToApplicationsFolderChanged}
            />
          </div>
        </DialogContent>
        {this.renderFooter()}
      </Dialog>
    )
  }

  private renderFooter() {
    return (
      <DialogFooter>
        <OkCancelButtonGroup
          okButtonText="Move and Restart"
          okButtonTitle="This will move GitHub Desktop to the Applications folder in your machine and restart the app."
          cancelButtonText="Not Now"
          onCancelButtonClick={this.onNotNow}
        />
      </DialogFooter>
    )
  }

  private onAskToMoveToApplicationsFolderChanged = (
    event: React.FormEvent<HTMLInputElement>
  ) => {
    const value = !event.currentTarget.checked

    this.setState({ askToMoveToApplicationsFolder: value })
  }

  private onNotNow = () => {
    this.props.onDismissed()
    this.props.dispatcher.setAskToMoveToApplicationsFolderSetting(
      this.state.askToMoveToApplicationsFolder
    )
  }

  private onSubmit = () => {
    this.props.onDismissed()

    try {
      this.props.dispatcher.moveToApplicationsFolder()
    } catch (error) {
      sendNonFatalException('moveApplication', error)
      this.props.dispatcher.postError(error)
    }
  }
}
