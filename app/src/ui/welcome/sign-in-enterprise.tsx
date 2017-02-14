import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Button } from '../lib/button'
import { SignIn } from '../lib/sign-in'
import { User } from '../../models/user'
import { Dispatcher, SignInStep } from '../../lib/dispatcher'

interface ISignInEnterpriseProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly signInState: SignInStep
}

/** The Welcome flow step to login to an Enterprise instance. */
export class SignInEnterprise extends React.Component<ISignInEnterpriseProps, void> {
  public render() {
    return (
      <div id='sign-in-enterprise'>
        <h1 className='welcome-title'>Sign in to your GitHub Enterprise server</h1>
        <p className='welcome-text'>Get started by signing into GitHub Enterprise</p>

        <SignIn
          currentStep={this.props.signInState}
          dispatcher={this.props.dispatcher}
        >
          <Button onClick={this.cancel}>Cancel</Button>
        </SignIn>
      </div>
    )
  }

  private cancel = () => {
    this.props.advance(WelcomeStep.Start)
  }

  private onDidSignIn = async (user: User) => {
    await this.props.dispatcher.addUser(user)

    this.props.advance(WelcomeStep.ConfigureGit)
  }
}
