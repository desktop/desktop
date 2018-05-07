import * as React from 'react'

import { UnknownResult } from '../../models/ssh'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Octicon, OcticonSymbol } from '../octicons'

import { LinkButton } from '../lib/link-button'
import { saveLogFile } from '../../lib/ssh'

interface IUnknownActionProps {
  readonly state: UnknownResult
  readonly onDismissed: () => void
}

export class UnknownAction extends React.Component<IUnknownActionProps, {}> {
  private saveFile = () => {
    saveLogFile(this.props.state.error)
  }

  public render() {
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Troubleshooting SSH"
        onDismissed={this.props.onDismissed}
      >
        <DialogContent>
          <p>
            Unfortunately Desktop has exhausted all known troubleshooting tricks
            for this issue.
          </p>
          <p>
            A trace file has been generated here that will help a human
            troubleshoot the issue. Please reach out to the{' '}
            <LinkButton uri="https://github.com/desktop/desktop/issues/new">
              GitHub Desktop
            </LinkButton>{' '}
            issue tracker for further support.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button onClick={this.props.onDismissed}>Close</Button>
            <Button className="submit" onClick={this.saveFile}>
              <Octicon symbol={OcticonSymbol.desktopDownload} /> Save log file
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
