import * as React from 'react'

import { INoRunningAgentState } from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Loading } from '../lib/loading'
import { Ref } from '../lib/ref'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

interface IStartSSHAgentProps {
  readonly dispatcher: Dispatcher
  readonly state: INoRunningAgentState
  readonly onDismissed: () => void
}

export class StartSSHAgent extends React.Component<IStartSSHAgentProps, {}> {
  private launchSSHAgent = () => {
    this.props.dispatcher.launchSSHAgent(this.props.state)
  }

  public render() {
    const { state } = this.props
    const disabled = state.isLoading

    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Troubleshoot SSH Authentication"
        onDismissed={this.props.onDismissed}
        onSubmit={this.launchSSHAgent}
      >
        <DialogContent>
          <p>
            A running <Ref>ssh-agent</Ref> process is required to perform
            authentication.
          </p>
          <p>
            Do you want to start the <Ref>ssh-agent</Ref> process found at{' '}
            <Ref>{state.sshLocation}</Ref>?
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {state.isLoading ? <Loading /> : null}
              Start
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
