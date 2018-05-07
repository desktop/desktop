import * as React from 'react'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface ICreateSSHKeyProps {
  readonly onDismissed: () => void
}

export class CreateSSHKey extends React.Component<ICreateSSHKeyProps, {}> {
  public render() {
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Create SSH Key"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>It looks like a valid SSH key was not found.</p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
            <Button className="submit" onClick={this.props.onDismissed}>
              Do it
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
