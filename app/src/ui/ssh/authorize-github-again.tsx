import * as React from 'react'

import { IAuthorizeGitHubAgainState } from '../../models/ssh'

import { Button } from '../lib/button'
import { ButtonGroup } from '../lib/button-group'
import { Loading } from '../lib/loading'
import { SignIn } from '../lib/sign-in'

import { Dialog, DialogContent, DialogFooter } from '../dialog'

import { Dispatcher } from '../../lib/dispatcher'
import { SignInState } from '../../lib/stores'

interface IAuthorizeGitHubAgainProps {
  readonly state: IAuthorizeGitHubAgainState
  readonly signInState: SignInState | null
  readonly dispatcher: Dispatcher
  readonly onDismissed: () => void
}

export class AuthorizeGitHubAgain extends React.Component<
  IAuthorizeGitHubAgainProps,
  {}
> {
  private keepOnKeepingOn = () => {
    this.props.onDismissed()
  }
  public render() {
    const { state } = this.props
    const disabled = state.isLoading

    if (this.props.signInState == null) {
      log.warn(`Unable to authorize again because we're not in a valid state`)
      return null
    }

    return (
      <Dialog
        id="troubleshoot-ssh"
        title="Troubleshoot SSH Authentication"
        onDismissed={this.props.onDismissed}
        onSubmit={this.keepOnKeepingOn}
      >
        <DialogContent>
          <p>
            The token associated with the {state.account.login} account ({
              state.account.name
            }) does not have permission to publish SSH keys for this account.
          </p>
          <p>To continue, you need to sign in again:</p>

          <p>
            <SignIn
              signInState={this.props.signInState}
              dispatcher={this.props.dispatcher}
            />
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
