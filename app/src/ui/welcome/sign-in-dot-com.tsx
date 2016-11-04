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

          <a href='' onClick={e => this.forgotPassword(e)}>Forgot password?</a>

          <div className='actions'>
            <button type='submit' disabled={signInDisabled}>Sign in (But not really. Use the browser for now please and thank you.)</button>
            <button onClick={e => this.cancel(e)}>Cancel</button>
          </div>

          <div>or</div>

          <a href='' onClick={e => this.signInWithBrowser(e)}>Sign in using your browser</a>
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

  private forgotPassword(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    shell.openExternal(ForgotPasswordURL)
  }

  private async signInWithBrowser(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault()

    await this.props.dispatcher.requestOAuth()

    this.advance()
  }

  private cancel(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault()

    this.advance()
  }

  private advance() {
    this.props.advance(WelcomeStep.ConfigureGit)
  }

  private signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // TODO: Actually sign in lolololol
  }
}
