import * as React from 'react'
import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface ITroubleshootSSHProps {
  /**
   * Event triggered when the dialog is dismissed by the user in the
   * ways described in the Dialog component's dismissable prop.
   */
  readonly onDismissed: () => void
}

export class TroubleshootSSH extends React.Component<
  ITroubleshootSSHProps,
  {}
> {
  public render() {
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Troubleshoot SSH"
        onDismissed={this.props.onDismissed}
        onSubmit={this.onStartTroubleshooting}
      >
        <DialogContent>
          <p>
            This repository contains a remote that authenticates to GitHub via
            SSH, but was unable to authenticate. Would you like to troubleshoot
            and see if the issue can be resolved?
          </p>
        </DialogContent>

        <DialogFooter>
          <ButtonGroup>
            <Button type="submit">Troubleshoot</Button>
            <Button onClick={this.props.onDismissed}>
              {__DARWIN__ ? 'Not Now' : 'Not now'}
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }

  private onStartTroubleshooting = () => {
    console.log('got here!')
  }
}
