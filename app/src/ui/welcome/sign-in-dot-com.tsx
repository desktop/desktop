import * as React from 'react'
import { WelcomeStep } from './welcome'
import { SignIn } from '../lib/sign-in'
import { Dispatcher } from '../dispatcher'
import { SignInState } from '../../lib/stores'
import { Button } from '../lib/button'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly signInState: SignInState | null
}

/** The Welcome flow step to login to GitHub.com. */
export class SignInDotCom extends React.Component<ISignInDotComProps, {}> {
  public componentWillMount() {
    this.props.dispatcher.beginDotComSignIn()
  }

  public render() {
    const state = this.props.signInState

    if (!state) {
      return null
    }

    return (
      <div id="sign-in-dot-com">
        <h1 className="welcome-title">Sign in to GitHub.com</h1>

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
