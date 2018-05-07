import * as React from 'react'

import { Repository } from '../../models/repository'
import { ValidateHostAction } from '../../models/ssh'

import { Dispatcher } from '../../lib/dispatcher'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Dialog, DialogContent, DialogFooter } from '../dialog'
import { Loading } from '../lib/loading'
import { LinkButton } from '../lib/link-button'

interface IValidateHostProps {
  readonly dispatcher: Dispatcher
  readonly repository: Repository
  readonly state: ValidateHostAction
  readonly onDismissed: () => void
}

export class ValidateHost extends React.Component<IValidateHostProps, {}> {
  private verifyHost = async () => {
    await this.props.dispatcher.validateHost(this.props.state)
  }

  public render() {
    const { state } = this.props
    const disabled = state.isLoading
    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Verify SSH Server"
        onDismissed={this.props.onDismissed}
        onSubmit={this.verifyHost}
      >
        <DialogContent>
          <p>A problem was encountered connecting to the host.</p>
          <p className="output">{state.rawOutput}</p>
          <p>
            You will need to verify that this is the correct host to continue.
            You can compare the value above with the entries documented in the{' '}
            <LinkButton uri="https://help.github.com/articles/testing-your-ssh-connection/">
              GitHub help documentation
            </LinkButton>.
          </p>
        </DialogContent>
        <DialogFooter>
          <ButtonGroup>
            <Button type="submit" disabled={disabled}>
              {state.isLoading ? <Loading /> : null}
              Verify
            </Button>
            <Button onClick={this.props.onDismissed}>Cancel</Button>
          </ButtonGroup>
        </DialogFooter>
      </Dialog>
    )
  }
}
