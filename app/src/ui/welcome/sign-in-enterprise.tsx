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
      <section
        id="sign-in-enterprise"
        aria-label="Sign in to your GitHub Enterprise"
      >
        <h1 className="welcome-title">Sign in to your GitHub Enterprise</h1>

        <SignIn signInState={state} dispatcher={this.props.dispatcher}>
          <Button onClick={this.cancel}>Cancel</Button>
        </SignIn>
      </section>
    )
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.Start)
  }
}
