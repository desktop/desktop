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
  private saveFile = async () => {
    try {
      await saveLogFile(this.props.state.error)
    } catch (err) {
      log.error(
        `[saveLogFile] an error occurred while trying to save the log file`,
        err
      )
    }
  }

  public render() {
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Unable to resolve issue"
        onSubmit={this.saveFile}
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
            <Button type="submit">
              <Octicon symbol={OcticonSymbol.desktopDownload} /> Save log file
            </Button>
            <Button onClick={this.props.onDismissed}>Close</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
