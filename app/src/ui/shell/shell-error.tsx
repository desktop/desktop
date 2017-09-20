import * as React from 'react'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IShellErrorProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void

  /**
   * Event to trigger if the user navigates to the Preferences dialog
   */
  readonly showPreferencesDialog: () => void

  /**
   * The text to display to the user relating to this error.
   */
  readonly message: string
}

/**
 * A dialog indicating something went wrong with launching their preferred
 * shell.
 */
export class ShellError extends React.Component<IShellErrorProps, {}> {
  private onShowPreferencesDialog = () => {
    this.props.onDismissed()
    this.props.showPreferencesDialog()
  }

  public render() {
    const title = __DARWIN__ ? 'Unable to Open Shell' : 'Unable to open shell'
    return (
      <Dialog
        id="shell-error"
        type="error"
        title={title}
        onSubmit={this.props.onDismissed}
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>{this.props.message}</p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" onClick={this.props.onDismissed}>
              Close
            </Button>
            <Button onClick={this.onShowPreferencesDialog}>
              {__DARWIN__ ? 'Open Preferences' : 'Open options'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
