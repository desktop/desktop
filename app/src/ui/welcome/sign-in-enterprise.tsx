import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Button } from '../lib/button'
import { SignIn } from '../lib/sign-in'
import { Dispatcher } from '../dispatcher'
import { SignInState } from '../../lib/stores'

interface ISignInEnterpriseProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly signInState: SignInState | null
}

/** The Welcome flow step to login to an Enterprise instance. */
export class SignInEnterprise extends React.Component<
  ISignInEnterpriseProps,
  {}
> {
  public render() {
    const state = this.props.signInState

    if (!state) {
      return null
    }

    return (
      <div id="sign-in-enterprise">
        <h1 className="welcome-title">
          Sign in to your GitHub Enterprise server
        </h1>

        <SignIn signInState={state} dispatcher={this.props.dispatcher}>
          <Button onClick={this.cancel}>Cancel</Button>
        </SignIn>
      </div>
    )
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.Start)
  }
}
