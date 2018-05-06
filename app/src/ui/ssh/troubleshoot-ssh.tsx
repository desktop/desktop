import * as React from 'react'
import { remote } from 'electron'
import * as Fs from 'fs'
import * as moment from 'moment'

import { Repository } from '../../models/repository'
import {
  TroubleshootingState,
  TroubleshootingStep,
  InitialState,
  ValidateHostAction,
  SuggestedAction,
  UnknownResult,
} from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'
import { assertNever } from '../../lib/fatal-error'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Loading } from '../lib/loading'
import { Ref } from '../lib/ref'
import { Octicon, OcticonSymbol } from '../octicons'

interface ITroubleshootSSHProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly troubleshootingState: TroubleshootingState | null

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
  public componentDidMount() {
    this.props.dispatcher.resetTroubleshooting()
  }

  private renderInitialState = (state: InitialState) => {
    return (
      <DialogContent>
        <p>
          It looks like you are having an issue connecting to an SSH remote.
        </p>
        <p>
          Do you want to troubleshoot your setup to see if Desktop can get this
          working?
        </p>
      </DialogContent>
    )
  }

  private renderValidateHost = (state: ValidateHostAction) => {
    return (
      <DialogContent>
        <p>
          Desktop is unable to connect to the host as the host key has not been
          verified.
        </p>
        <p>
          <Ref>{state.rawOutput}</Ref>
        </p>
        <p>Would you like to verify this is the correct host?</p>
      </DialogContent>
    )
  }

  private renderSuggestedAction = (state: SuggestedAction) => {
    return (
      <DialogContent>
        <p>WHAT ARE WE PUTTING IN HERE?</p>
      </DialogContent>
    )
  }

  private renderUnknown = (state: UnknownResult): JSX.Element => {
    return (
      <DialogContent>
        <p>
          Unfortunately Desktop has exhausted all known troubleshooting this
          issue.
        </p>
        <p>
          A trace file has been generated here that will help with a human
          troubleshooting the issue.
        </p>
      </DialogContent>
    )
  }

  private renderStep() {
    const state = this.props.troubleshootingState
    if (state == null) {
      log.warn(`We've got a null state here. uh-oh`)
      return null
    }

    const stepText = state.kind

    switch (state.kind) {
      case TroubleshootingStep.InitialState:
        return this.renderInitialState(state)
      case TroubleshootingStep.ValidateHost:
        return this.renderValidateHost(state)
      case TroubleshootingStep.SuggestAction:
        return this.renderSuggestedAction(state)
      case TroubleshootingStep.Unknown:
        return this.renderUnknown(state)
      default:
        return assertNever(state, `Unknown troubleshooting step: ${stepText}`)
    }
  }

  private startTroubleshooting = () => {
    this.props.dispatcher.startTroubleshooting(this.props.repository)
  }

  private verifyHost = async () => {
    const state = this.props.troubleshootingState
    if (state == null || state.kind !== TroubleshootingStep.ValidateHost) {
      log.warn('trying to validate host when in the wrong state')
      return
    }

    await this.props.dispatcher.validateHost(state.host)
    this.props.dispatcher.startTroubleshooting(this.props.repository)
  }

  private saveFile = () => {
    const state = this.props.troubleshootingState
    if (state == null || state.kind !== TroubleshootingStep.Unknown) {
      log.warn('trying to save a file when in the wrong state')
      return
    }

    const timestamp = moment().format('YYYYMMDD-HHmmss')
    const defaultPath = `ssh-output-${timestamp}.txt`

    // TODO: null should be a valid argument here
    const window: any = null
    remote.dialog.showSaveDialog(window, { defaultPath }, filename => {
      if (filename == null) {
        log.warn('filename returned null, this needs to be in the signature')
        return
      }
      Fs.writeFileSync(filename, state.error)
    })
  }

  private renderFooter(): JSX.Element | null {
    const state = this.props.troubleshootingState
    if (state == null) {
      log.warn(`We've got a null state here. uh-oh`)
      return null
    }

    const stepKind = state.kind

    switch (state.kind) {
      case TroubleshootingStep.InitialState:
        const disabled = state.isLoading
        return (
          <DialogFooter>
            <ButtonGroup>
              <Button onClick={this.props.onDismissed}>Cancel</Button>
              <Button
                className="submit"
                disabled={disabled}
                onClick={this.startTroubleshooting}
              >
                {state.isLoading ? <Loading /> : null}
                Start
              </Button>
            </ButtonGroup>
          </DialogFooter>
        )
      case TroubleshootingStep.ValidateHost:
        return (
          <DialogFooter>
            <ButtonGroup>
              <Button onClick={this.props.onDismissed}>Cancel</Button>
              <Button className="submit" onClick={this.verifyHost}>
                Verify
              </Button>
            </ButtonGroup>
          </DialogFooter>
        )
      case TroubleshootingStep.SuggestAction:
        // TODO: what should we do here?
        return (
          <DialogFooter>
            <ButtonGroup>
              <Button onClick={this.props.onDismissed}>Cancel</Button>
              <Button className="submit" onClick={this.props.onDismissed}>
                Do it
              </Button>
            </ButtonGroup>
          </DialogFooter>
        )
      case TroubleshootingStep.Unknown:
        return (
          <DialogFooter>
            <ButtonGroup>
              <Button onClick={this.props.onDismissed}>Close</Button>
              <Button className="submit" onClick={this.saveFile}>
                <Octicon symbol={OcticonSymbol.desktopDownload} /> Save log file
              </Button>
            </ButtonGroup>
          </DialogFooter>
        )
      default:
        return assertNever(state, `Unknown troubleshooting step ${stepKind}`)
    }
  }

  public render() {
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Troubleshoot SSH"
        onDismissed={this.props.onDismissed}
      >
        {this.renderStep()}
        {this.renderFooter()}
      </Dialog>
    )
  }
}
