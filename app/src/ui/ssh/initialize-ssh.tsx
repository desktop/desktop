import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IInitializeSSHProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

export class InitializeSSH extends React.Component<IInitializeSSHProps, {}> {
  public render() {
    return (
      <Dialog
        id="initialize-ssh"
        title="Initialize SSH"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onInitialize}
      >
        <DialogContent>
          <p>
            This repository contains a remote that authenticates to GitHub via
            SSH, but no existing authentication agent was found. Would you like
            to setup an SSH agent?
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Initialize SSH Agent</Button>
            <Button onClick={this.props.onDismissed}>
              {__DARWIN__ ? 'Not Now' : 'Not now'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onInitialize = () => {
    console.log('got here!')
  }
}
