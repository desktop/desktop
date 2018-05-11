import * as React from 'react'

import { Repository } from '../../models/repository'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Loading } from '../lib/loading'
import { generateSSHTroubleshootingLog, saveLogFile } from '../../lib/ssh'
import { Octicon, OcticonSymbol } from '../octicons'

interface IWelcomeProps {
  readonly repository: Repository
  readonly onDismissed: () => void
}

interface IWelcomeState {
  readonly isLoading: boolean
}

export class Welcome extends React.Component<IWelcomeProps, IWelcomeState> {
  public constructor(props: IWelcomeProps) {
    super(props)

    this.state = { isLoading: false }
  }

  private startTroubleshooting = async () => {
    this.setState({ isLoading: true })

    const contents = await generateSSHTroubleshootingLog(this.props.repository)
    await saveLogFile(contents)

    this.setState({ isLoading: false })
  }

  public render() {
    const disabled = this.state.isLoading

    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Troubleshoot SSH Authentication"
        onDismissed={this.props.onDismissed}
        onSubmit={this.startTroubleshooting}
      >
        <DialogContent>
          <p>
            It looks like you are having an issue connecting to an SSH remote.
          </p>
          <p>
            You can generate a log file about the details of your setup to help
            with troubleshooting.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {this.state.isLoading ? (
                <Loading />
              ) : (
                <Octicon symbol={OcticonSymbol.desktopDownload} />
              )}{' '}
              Troubleshoot
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
