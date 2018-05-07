import * as React from 'react'

import { Repository } from '../../models/repository'
import { InitialState } from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Loading } from '../lib/loading'

interface IWelcomeProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly state: InitialState
  readonly onDismissed: () => void
}

export class Welcome extends React.Component<IWelcomeProps, {}> {
  private startTroubleshooting = () => {
    this.props.dispatcher.startTroubleshooting(this.props.repository)
  }

  public render() {
    const { state } = this.props
    const disabled = state.isLoading

    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Verify SSH Server"
        onDismissed={this.props.onDismissed}
        onSubmit={this.startTroubleshooting}
      >
        <DialogContent>
          <p>
            It looks like you are having an issue connecting to an SSH remote.
          </p>
          <p>
            Do you want to troubleshoot your setup to see if Desktop can get
            this working?
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
