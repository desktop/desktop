import * as React from 'react'
import { shell } from 'electron'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'

const ForgotPasswordURL = 'https://github.com/password_reset'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
  readonly cancel: () => void
}

export class SignInDotCom extends React.Component<ISignInDotComProps, void> {
  public render() {
    return (
      <div>
        <h1>Sign in to GitHub.com</h1>
        <div>Get started by signing into GitHub.com</div>

        <label>Username or email address
          <input/>
        </label>

        <label>Password
          <input/>
        </label>

        <a onClick={e => this.forgotPassword(e)}>Forgot password?</a>

        <div>
          <button onClick={() => this.signIn()}>Sign in</button>
          <button onClick={() => this.advance()}>Cancel</button>
        </div>

        <div>or</div>

        <a onClick={e => this.signInWithBrowser(e)}>Sign in using your browser</a>
      </div>
    )
  }

  private forgotPassword(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    shell.openExternal(ForgotPasswordURL)
  }

  private signInWithBrowser(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    this.props.dispatcher.requestOAuth()

    this.advance()
  }

  private advance() {
    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private signIn() {
    // TODO: Actually sign in lolololol
  }
}
