import * as React from 'react'
import { WelcomeStep } from './welcome'
import { SignInDotCom as SignInDotComFragment } from '../lib/sign-in-dot-com'
import { Dispatcher } from '../../lib/dispatcher'
import { Button } from '../lib/button'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
}

/** The Welcome flow step to login to GitHub.com. */
export class SignInDotCom extends React.Component<ISignInDotComProps, void> {
  public render() {
    return (
      <div id='sign-in-dot-com'>
        <h1>Sign in to GitHub.com</h1>
        <div>Get started by signing into GitHub.com</div>

        <SignInDotComFragment
          additionalButtons={[
            <Button onClick={() => this.cancel()}>Cancel</Button>,
          ]}
          onSignInWithBrowser={() => this.signInWithBrowser()}/>
      </div>
    )
  }

  private async signInWithBrowser() {
    await this.props.dispatcher.requestOAuth()

    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private cancel() {
    this.props.advance(WelcomeStep.Start)
  }
}
