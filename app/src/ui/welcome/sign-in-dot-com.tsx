import * as React from 'react'
import { WelcomeStep } from './welcome'
import { SignIn } from '../lib/sign-in'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'
import { User } from '../../models/user'
import { getDotComAPIEndpoint } from '../../lib/api'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
}

/** The Welcome flow step to login to GitHub.com. */
export class SignInDotCom extends React.Component<ISignInDotComProps, void> {
  public render() {
    return (
      <div id='sign-in-dot-com'>
        <h1 className='welcome-title'>Sign in to GitHub.com</h1>

        <SignIn
          dispatcher={this.props.dispatcher}
          endpoint={getDotComAPIEndpoint()}
          onDidSignIn={this.onDidSignIn}>
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
