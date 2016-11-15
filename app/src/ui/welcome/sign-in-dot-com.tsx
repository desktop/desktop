/* tslint:disable:react-this-binding-issue */

import * as React from 'react'
import { WelcomeStep } from './welcome'
import { Dispatcher } from '../../lib/dispatcher'
import { LinkButton } from '../lib/link-button'
import { Button } from '../lib/button'

const ForgotPasswordURL = 'https://github.com/password_reset'

interface ISignInDotComProps {
  readonly dispatcher: Dispatcher
  readonly advance: (step: WelcomeStep) => void
}

interface ISignInDotComState {
  readonly username: string
  readonly password: string
}

/** The Welcome flow step to login to GitHub.com. */
export class SignInDotCom extends React.Component<ISignInDotComProps, ISignInDotComState> {
  public constructor(props: ISignInDotComProps) {
    super(props)

    this.state = { username: '', password: '' }
  }

  public render() {
    // Always disabled as we don't support sign in in-app yet.
    const signInDisabled = Boolean(!this.state.username.length || !this.state.password.length) || true
    return (
      <div id='sign-in-dot-com'>
        <h1>Sign in to GitHub.com</h1>
        <div>Get started by signing into GitHub.com</div>

        <form id='sign-in-form' onSubmit={e => this.signIn(e)}>
          <label>Username or email address
            <input onChange={e => this.onUsernameChange(e)}/>
          </label>

          <label>Password
            <input type='password' onChange={e => this.onPasswordChange(e)}/>
          </label>

          <LinkButton uri={ForgotPasswordURL}>Forgot password?</LinkButton>

          <div className='actions'>
            <Button type='submit' disabled={signInDisabled}>Sign in (But not really. Use the browser for now please and thank you.)</Button>
            <Button onClick={() => this.cancel()}>Cancel</Button>
          </div>

          <div>or</div>

          <LinkButton onClick={() => this.signInWithBrowser()}>Sign in using your browser</LinkButton>
        </form>
      </div>
    )
  }

  private onUsernameChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: event.currentTarget.value,
      password: this.state.password,
    })
  }

  private onPasswordChange(event: React.FormEvent<HTMLInputElement>) {
    this.setState({
      username: this.state.username,
      password: event.currentTarget.value,
    })
  }

  private async signInWithBrowser() {
    await this.props.dispatcher.requestOAuth()

    this.advance()
  }

  private cancel() {
    this.props.advance(WelcomeStep.Start)
  }

  private advance() {
    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // TODO: Actually sign in lolololol
  }
}
